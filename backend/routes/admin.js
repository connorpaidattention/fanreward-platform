const express = require('express');
const { authenticateAdmin } = require('../middleware/auth');
const { User, RewardLog, TrackingSession, PlatformConnection } = require('../models');
const { manualSync } = require('../services/cronJobs');
const { logger } = require('../utils/logger');
const router = express.Router();

// Get dashboard overview statistics
router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalConnections,
      activeConnections,
      totalSessions,
      activeSessions,
      totalRewards,
      recentActivity
    ] = await Promise.all([
      // User statistics
      User.countDocuments({ isDeleted: false }),
      User.countDocuments({ 
        isActive: true, 
        isDeleted: false,
        lastActiveAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      
      // Connection statistics
      PlatformConnection.countDocuments({}),
      PlatformConnection.countDocuments({ status: 'connected' }),
      
      // Session statistics
      TrackingSession.countDocuments({}),
      TrackingSession.countDocuments({ status: { $in: ['active', 'paused'] } }),
      
      // Reward statistics
      RewardLog.countDocuments({ status: { $in: ['processed', 'verified'] } }),
      
      // Recent activity (last 24 hours)
      Promise.all([
        User.countDocuments({ 
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }),
        RewardLog.countDocuments({ 
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }),
        TrackingSession.countDocuments({ 
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]).then(([newUsers, newRewards, newSessions]) => ({
        newUsers,
        newRewards,
        newSessions
      }))
    ]);

    // Get platform breakdown
    const platformStats = await PlatformConnection.aggregate([
      {
        $group: {
          _id: '$platform',
          total: { $sum: 1 },
          connected: {
            $sum: { $cond: [{ $eq: ['$status', 'connected'] }, 1, 0] }
          },
          totalPoints: { $sum: '$totalPointsAwarded' },
          totalItems: { $sum: '$totalItemsProcessed' }
        }
      }
    ]);

    // Get top users
    const topUsers = await User.find({ isActive: true, isDeleted: false })
      .sort({ totalPoints: -1 })
      .limit(10)
      .select('displayName email totalPoints createdAt lastActiveAt');

    res.json({
      success: true,
      dashboard: {
        users: {
          total: totalUsers,
          active: activeUsers,
          recent: recentActivity.newUsers
        },
        connections: {
          total: totalConnections,
          active: activeConnections,
          platforms: platformStats
        },
        sessions: {
          total: totalSessions,
          active: activeSessions,
          recent: recentActivity.newSessions
        },
        rewards: {
          total: totalRewards,
          recent: recentActivity.newRewards
        },
        topUsers
      }
    });
  } catch (error) {
    logger.error('Error fetching admin dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get all users with pagination and filters
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.min(Math.max(parseInt(limit), 1), 100);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      switch (status) {
        case 'active':
          query.isActive = true;
          query.isDeleted = false;
          break;
        case 'inactive':
          query.isActive = false;
          query.isDeleted = false;
          break;
        case 'deleted':
          query.isDeleted = true;
          break;
      }
    } else {
      query.isDeleted = false; // Default: don't show deleted users
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [users, totalCount] = await Promise.all([
      User.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .select('-loginAttempts -lockUntil'),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasNext: pageNum * limitNum < totalCount,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get specific user details
router.get('/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [user, connections, recentRewards, recentSessions] = await Promise.all([
      User.findById(userId).select('-loginAttempts -lockUntil'),
      PlatformConnection.find({ userId }),
      RewardLog.find({ userId }).sort({ createdAt: -1 }).limit(10),
      TrackingSession.find({ userId }).sort({ startedAt: -1 }).limit(10)
    ]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRank = await User.getUserRank(userId);

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        rank: userRank
      },
      connections,
      recentRewards,
      recentSessions
    });
  } catch (error) {
    logger.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Update user account
router.put('/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, ...updates } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let updateResult;
    let actionDescription;

    switch (action) {
      case 'activate':
        updateResult = await User.findByIdAndUpdate(userId, { isActive: true }, { new: true });
        actionDescription = 'activated';
        break;
        
      case 'deactivate':
        updateResult = await User.findByIdAndUpdate(userId, { isActive: false }, { new: true });
        actionDescription = 'deactivated';
        break;
        
      case 'verify':
        updateResult = await User.findByIdAndUpdate(userId, { isVerified: true }, { new: true });
        actionDescription = 'verified';
        break;
        
      case 'unverify':
        updateResult = await User.findByIdAndUpdate(userId, { isVerified: false }, { new: true });
        actionDescription = 'unverified';
        break;
        
      case 'delete':
        updateResult = await User.findByIdAndUpdate(userId, { isDeleted: true, isActive: false }, { new: true });
        actionDescription = 'deleted';
        break;
        
      case 'restore':
        updateResult = await User.findByIdAndUpdate(userId, { isDeleted: false, isActive: true }, { new: true });
        actionDescription = 'restored';
        break;
        
      case 'update':
        // Allow updating specific fields
        const allowedUpdates = ['displayName', 'email', 'isPremium', 'preferences'];
        const filteredUpdates = {};
        
        allowedUpdates.forEach(field => {
          if (updates[field] !== undefined) {
            filteredUpdates[field] = updates[field];
          }
        });
        
        updateResult = await User.findByIdAndUpdate(userId, filteredUpdates, { 
          new: true, 
          runValidators: true 
        }).select('-loginAttempts -lockUntil');
        actionDescription = 'updated';
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    // Create audit log
    await RewardLog.create({
      userId,
      type: 'manual',
      source: 'admin',
      pointsAwarded: 0,
      basePoints: 0,
      description: `Account ${actionDescription} by admin`,
      metadata: {
        adminAction: action,
        adminEmail: req.user.user.email,
        previousState: action === 'update' ? user.toObject() : undefined
      }
    });

    logger.info(`Admin ${req.user.user.email} ${actionDescription} user ${userId}`);

    res.json({
      success: true,
      user: updateResult,
      message: `User account ${actionDescription} successfully`
    });
  } catch (error) {
    logger.error('Error updating user account:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Failed to update user account' });
  }
});

// Adjust user points
router.post('/users/:userId/points', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { points, reason, type = 'manual' } = req.body;

    if (!points || !reason) {
      return res.status(400).json({ error: 'Points amount and reason are required' });
    }

    const pointsAmount = parseInt(points);
    if (isNaN(pointsAmount)) {
      return res.status(400).json({ error: 'Invalid points amount' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user points
    await user.addPoints(pointsAmount, 'admin');

    // Create reward log entry
    await RewardLog.create({
      userId,
      type,
      source: 'admin',
      pointsAwarded: pointsAmount,
      basePoints: pointsAmount,
      multiplier: 1,
      description: reason,
      metadata: {
        adminEmail: req.user.user.email,
        adjustment: true,
        previousTotal: user.totalPoints - pointsAmount
      }
    });

    logger.info(`Admin ${req.user.user.email} adjusted points for user ${userId}: ${pointsAmount} (${reason})`);

    res.json({
      success: true,
      pointsAdjustment: pointsAmount,
      newTotal: user.totalPoints,
      message: `Successfully ${pointsAmount > 0 ? 'added' : 'deducted'} ${Math.abs(pointsAmount)} points`
    });
  } catch (error) {
    logger.error('Error adjusting user points:', error);
    res.status(500).json({ error: 'Failed to adjust user points' });
  }
});

// Get platform connection statistics
router.get('/platforms/stats', authenticateAdmin, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    let days;
    switch (timeframe) {
      case '7d': days = 7; break;
      case '30d': days = 30; break;
      case '90d': days = 90; break;
      default: days = 30;
    }
    
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get comprehensive platform statistics
    const [platformStats, errorStats, syncStats] = await Promise.all([
      PlatformConnection.aggregate([
        {
          $group: {
            _id: '$platform',
            total: { $sum: 1 },
            connected: { $sum: { $cond: [{ $eq: ['$status', 'connected'] }, 1, 0] } },
            expired: { $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] } },
            error: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
            totalPoints: { $sum: '$totalPointsAwarded' },
            totalItems: { $sum: '$totalItemsProcessed' },
            avgSyncDuration: { $avg: '$averageSyncDuration' }
          }
        }
      ]),
      
      PlatformConnection.aggregate([
        {
          $match: {
            errorCount: { $gt: 0 },
            'lastError.timestamp': { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$platform',
            errorCount: { $sum: '$errorCount' },
            uniqueErrors: { $addToSet: '$lastError.code' }
          }
        }
      ]),
      
      PlatformConnection.aggregate([
        {
          $unwind: '$syncHistory'
        },
        {
          $match: {
            'syncHistory.syncedAt': { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$platform',
            totalSyncs: { $sum: 1 },
            successfulSyncs: { $sum: { $cond: [{ $eq: ['$syncHistory.status', 'success'] }, 1, 0] } },
            avgDuration: { $avg: '$syncHistory.duration' },
            totalItemsProcessed: { $sum: '$syncHistory.itemsProcessed' },
            totalPointsAwarded: { $sum: '$syncHistory.pointsAwarded' }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      timeframe,
      platformStats,
      errorStats,
      syncStats,
      summary: {
        totalConnections: platformStats.reduce((sum, p) => sum + p.total, 0),
        activeConnections: platformStats.reduce((sum, p) => sum + p.connected, 0),
        totalErrors: errorStats.reduce((sum, p) => sum + p.errorCount, 0)
      }
    });
  } catch (error) {
    logger.error('Error fetching platform statistics:', error);
    res.status(500).json({ error: 'Failed to fetch platform statistics' });
  }
});

// Trigger manual sync for all users or specific platform
router.post('/sync', authenticateAdmin, async (req, res) => {
  try {
    const { platform, userId } = req.body;

    if (platform && !['spotify', 'youtube', 'instagram'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    logger.info(`Admin ${req.user.user.email} triggered manual sync`, { platform, userId });

    // Trigger sync (this will run async)
    manualSync(platform, userId).then((result) => {
      logger.info('Manual sync completed by admin:', result);
    }).catch((error) => {
      logger.error('Manual sync failed:', error);
    });

    res.json({
      success: true,
      message: 'Manual sync initiated. Check logs for progress.',
      target: {
        platform: platform || 'all',
        userId: userId || 'all'
      }
    });
  } catch (error) {
    logger.error('Error triggering manual sync:', error);
    res.status(500).json({ error: 'Failed to trigger manual sync' });
  }
});

// Get system health and status
router.get('/system/health', authenticateAdmin, async (req, res) => {
  try {
    const [dbStats, memoryUsage] = await Promise.all([
      // Database statistics
      Promise.all([
        User.estimatedDocumentCount(),
        RewardLog.estimatedDocumentCount(),
        TrackingSession.estimatedDocumentCount(),
        PlatformConnection.estimatedDocumentCount()
      ]).then(([users, rewards, sessions, connections]) => ({
        users, rewards, sessions, connections
      })),
      
      // Memory usage
      process.memoryUsage()
    ]);

    const uptime = process.uptime();
    const uptimeString = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

    res.json({
      success: true,
      system: {
        status: 'healthy',
        uptime: uptimeString,
        uptimeSeconds: uptime,
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024)
        },
        database: {
          status: 'connected',
          collections: dbStats
        },
        nodejs: process.version,
        environment: process.env.NODE_ENV
      }
    });
  } catch (error) {
    logger.error('Error fetching system health:', error);
    res.status(500).json({ error: 'Failed to fetch system health' });
  }
});

// Get audit logs
router.get('/audit', authenticateAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      startDate,
      endDate
    } = req.query;

    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.min(Math.max(parseInt(limit), 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const query = { source: 'admin' };
    
    if (userId) query.userId = userId;
    if (action) query.type = action;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [auditLogs, totalCount] = await Promise.all([
      RewardLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('userId', 'displayName email'),
      RewardLog.countDocuments(query)
    ]);

    res.json({
      success: true,
      auditLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasNext: pageNum * limitNum < totalCount,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;