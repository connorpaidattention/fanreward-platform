const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { User, PlatformConnection } = require('../models');
const { getTokenStatus, revokeTokens, validateTokens } = require('../services/tokenService');
const { manualSync } = require('../services/cronJobs');
const { logger } = require('../utils/logger');
const router = express.Router();

// Get user's platform connections
router.get('/connections', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const connections = await PlatformConnection.getUserConnections(userId);
    const tokenStatus = await getTokenStatus(userId);
    
    // Enhance connections with token status
    const enhancedConnections = connections.map(connection => ({
      ...connection.toObject(),
      tokenStatus: tokenStatus[connection.platform] || { connected: false, valid: false }
    }));
    
    res.json({
      success: true,
      connections: enhancedConnections,
      summary: {
        total: connections.length,
        connected: connections.filter(c => c.status === 'connected').length,
        expired: connections.filter(c => c.status === 'expired').length,
        error: connections.filter(c => c.status === 'error').length
      }
    });
  } catch (error) {
    logger.error('Error fetching platform connections:', error);
    res.status(500).json({ error: 'Failed to fetch platform connections' });
  }
});

// Get connection status for specific platform
router.get('/connections/:platform', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;
    
    if (!['spotify', 'youtube', 'instagram'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    const connection = await PlatformConnection.findOne({ userId, platform });
    const tokenStatus = await getTokenStatus(userId);
    
    if (!connection) {
      return res.json({
        success: true,
        connected: false,
        platform,
        message: `${platform} account is not connected`
      });
    }
    
    res.json({
      success: true,
      connected: true,
      platform,
      connection: {
        ...connection.toObject(),
        tokenStatus: tokenStatus[platform] || { connected: false, valid: false }
      }
    });
  } catch (error) {
    logger.error('Error fetching platform connection:', error);
    res.status(500).json({ error: 'Failed to fetch platform connection' });
  }
});

// Disconnect a platform
router.delete('/connections/:platform', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;
    
    if (!['spotify', 'youtube', 'instagram'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    // Revoke tokens and clear user data
    await revokeTokens(userId, platform);
    
    // Update connection status
    await PlatformConnection.findOneAndUpdate(
      { userId, platform },
      { 
        status: 'disconnected',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null
      }
    );
    
    logger.info(`Platform ${platform} disconnected for user ${userId}`);
    
    res.json({
      success: true,
      platform,
      message: `${platform} account has been disconnected successfully`
    });
  } catch (error) {
    logger.error('Error disconnecting platform:', error);
    res.status(500).json({ error: 'Failed to disconnect platform' });
  }
});

// Refresh connection tokens
router.post('/connections/:platform/refresh', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;
    
    if (!['spotify', 'youtube', 'instagram'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    const tokenResults = await validateTokens(userId);
    const platformResult = tokenResults[platform];
    
    if (!platformResult || !platformResult.valid) {
      return res.status(400).json({ 
        error: `Unable to refresh ${platform} token. Please reconnect your account.`,
        code: 'REFRESH_FAILED'
      });
    }
    
    res.json({
      success: true,
      platform,
      refreshed: platformResult.refreshed,
      message: platformResult.refreshed 
        ? `${platform} token refreshed successfully`
        : `${platform} token is still valid`
    });
  } catch (error) {
    logger.error('Error refreshing platform tokens:', error);
    res.status(500).json({ error: 'Failed to refresh platform tokens' });
  }
});

// Get sync history for a platform
router.get('/connections/:platform/sync-history', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;
    const { limit = 10 } = req.query;
    
    if (!['spotify', 'youtube', 'instagram'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    const connection = await PlatformConnection.findOne({ userId, platform });
    
    if (!connection) {
      return res.status(404).json({ error: 'Platform connection not found' });
    }
    
    // Get recent sync history
    const recentSyncs = connection.syncHistory
      .sort((a, b) => new Date(b.syncedAt) - new Date(a.syncedAt))
      .slice(0, Math.min(parseInt(limit), 50));
    
    res.json({
      success: true,
      platform,
      syncHistory: recentSyncs,
      summary: {
        totalSyncs: connection.syncHistory.length,
            totalItemsProcessed: connection.totalItemsProcessed,
        totalPointsAwarded: connection.totalPointsAwarded,
        lastSyncAt: connection.lastSyncAt,
        nextSyncAt: connection.nextSyncAt,
        averageSyncDuration: connection.averageSyncDuration
      }
    });
  } catch (error) {
    logger.error('Error fetching sync history:', error);
    res.status(500).json({ error: 'Failed to fetch sync history' });
  }
});

// Manually trigger sync for a platform
router.post('/connections/:platform/sync', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;
    
    if (!['spotify', 'youtube', 'instagram'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    const connection = await PlatformConnection.findOne({ userId, platform });
    
    if (!connection || connection.status !== 'connected') {
      return res.status(400).json({ 
        error: `${platform} account is not connected or has connection issues` 
      });
    }
    
    // Check for rate limiting (max 1 manual sync per 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (connection.lastSyncAt && connection.lastSyncAt > tenMinutesAgo) {
      const nextSyncTime = new Date(connection.lastSyncAt.getTime() + 10 * 60 * 1000);
      return res.status(429).json({ 
        error: 'Manual sync rate limit exceeded. Please wait before trying again.',
        nextSyncAllowed: nextSyncTime
      });
    }
    
    // Trigger manual sync
    const pointsAwarded = await manualSync(platform, userId);
    
    res.json({
      success: true,
      platform,
      pointsAwarded,
      message: `Manual sync completed! Awarded ${pointsAwarded} points from your ${platform} activity.`
    });
  } catch (error) {
    logger.error('Error triggering manual sync:', error);
    
    if (error.message.includes('token') || error.message.includes('expired')) {
      return res.status(401).json({ 
        error: `Your ${req.params.platform} connection has expired. Please reconnect your account.`,
        code: 'TOKEN_EXPIRED'
      });
    }
    
    res.status(500).json({ error: 'Failed to perform manual sync' });
  }
});

// Update sync settings for a platform
router.put('/connections/:platform/settings', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;
    const { enabled, frequency, syncHistoric, maxItemsPerSync } = req.body;
    
    if (!['spotify', 'youtube', 'instagram'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    const connection = await PlatformConnection.findOne({ userId, platform });
    
    if (!connection) {
      return res.status(404).json({ error: 'Platform connection not found' });
    }
    
    // Update sync settings
    const updates = {};
    
    if (typeof enabled === 'boolean') {
      updates['syncSettings.enabled'] = enabled;
    }
    
    if (frequency && ['hourly', 'daily', 'weekly'].includes(frequency)) {
      updates['syncSettings.frequency'] = frequency;
    }
    
    if (typeof syncHistoric === 'boolean') {
      updates['syncSettings.syncHistoric'] = syncHistoric;
    }
    
    if (maxItemsPerSync && maxItemsPerSync > 0 && maxItemsPerSync <= 1000) {
      updates['syncSettings.maxItemsPerSync'] = maxItemsPerSync;
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' });
    }
    
    const updatedConnection = await PlatformConnection.findOneAndUpdate(
      { userId, platform },
      { $set: updates },
      { new: true }
    );
    
    logger.info(`Updated sync settings for ${platform} connection of user ${userId}:`, updates);
    
    res.json({
      success: true,
      platform,
      syncSettings: updatedConnection.syncSettings,
      message: `${platform} sync settings updated successfully`
    });
  } catch (error) {
    logger.error('Error updating sync settings:', error);
    res.status(500).json({ error: 'Failed to update sync settings' });
  }
});

// Get platform statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeframe = '30d' } = req.query;
    
    let days;
    switch (timeframe) {
      case '7d': days = 7; break;
      case '30d': days = 30; break;
      case '90d': days = 90; break;
      default: days = 30;
    }
    
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Get platform connections and their stats
    const connections = await PlatformConnection.find({ userId });
    
    const stats = await Promise.all(connections.map(async (connection) => {
      // Get recent sync stats
      const recentSyncs = connection.syncHistory.filter(
        sync => sync.syncedAt >= startDate
      );
      
      const totalItemsInPeriod = recentSyncs.reduce((sum, sync) => sum + sync.itemsProcessed, 0);
      const totalPointsInPeriod = recentSyncs.reduce((sum, sync) => sum + sync.pointsAwarded, 0);
      
      return {
        platform: connection.platform,
        status: connection.status,
        connectedAt: connection.connectedAt,
        lastSyncAt: connection.lastSyncAt,
        totalItemsProcessed: connection.totalItemsProcessed,
        totalPointsAwarded: connection.totalPointsAwarded,
        recentActivity: {
          syncs: recentSyncs.length,
          itemsProcessed: totalItemsInPeriod,
          pointsAwarded: totalPointsInPeriod
        },
        syncSettings: connection.syncSettings,
        errorCount: connection.errorCount,
        lastError: connection.lastError
      };
    }));
    
    res.json({
      success: true,
      timeframe,
      platforms: stats,
      summary: {
        totalConnections: connections.length,
        activeConnections: connections.filter(c => c.status === 'connected').length,
        totalPointsAllTime: connections.reduce((sum, c) => sum + (c.totalPointsAwarded || 0), 0),
        totalItemsAllTime: connections.reduce((sum, c) => sum + (c.totalItemsProcessed || 0), 0)
      }
    });
  } catch (error) {
    logger.error('Error fetching platform stats:', error);
    res.status(500).json({ error: 'Failed to fetch platform statistics' });
  }
});

// Test platform API connectivity
router.post('/test/:platform', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;
    
    if (!['spotify', 'youtube', 'instagram'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    const user = await User.findById(userId);
    const connection = await PlatformConnection.findOne({ userId, platform });
    
    if (!connection || connection.status !== 'connected') {
      return res.status(400).json({ error: `${platform} account is not connected` });
    }
    
    // Test API connectivity based on platform
    let testResult = { success: false, error: null };
    
    try {
      switch (platform) {
        case 'spotify':
          // Test Spotify API
          const { refreshSpotifyToken } = require('../services/tokenService');
          await refreshSpotifyToken(user);
          testResult = { success: true, message: 'Spotify API connection successful' };
          break;
          
        case 'youtube':
          // Test YouTube API
          const { refreshYouTubeToken } = require('../services/tokenService');
          await refreshYouTubeToken(user);
          testResult = { success: true, message: 'YouTube API connection successful' };
          break;
          
        case 'instagram':
          // Instagram API test would go here
          testResult = { success: true, message: 'Instagram API connection test (simulated)' };
          break;
      }
    } catch (apiError) {
      testResult = { 
        success: false, 
        error: apiError.message,
        code: apiError.code || 'API_TEST_FAILED'
      };
    }
    
    // Update connection based on test result
    if (testResult.success) {
      await PlatformConnection.findOneAndUpdate(
        { userId, platform },
        { 
          status: 'connected',
          errorCount: 0,
          lastError: null
        }
      );
    } else {
      await connection.recordError({
        message: testResult.error,
        code: testResult.code || 'API_TEST_FAILED'
      });
    }
    
    res.json({
      success: testResult.success,
      platform,
      message: testResult.message || testResult.error,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Error testing platform connectivity:', error);
    res.status(500).json({ error: 'Failed to test platform connectivity' });
  }
});

module.exports = router;