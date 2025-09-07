const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { User, RewardLog, TrackingSession } = require('../models');
const { calculateHistoricRewards, updateLiveTrackingPoints, validateAndAwardPoints } = require('../services/rewardService');
const { logger } = require('../utils/logger');
const router = express.Router();

// Get user's total points and breakdown
router.get('/points', authenticateToken, async (req, res) => {
  try {
    const user = req.user.user;
    
    res.json({ 
      success: true,
      totalPoints: user.totalPoints || 0,
      pointsBreakdown: user.pointsBreakdown || {},
      lifetimePointsEarned: user.lifetimePointsEarned || 0,
      pointsRedeemed: user.pointsRedeemed || 0,
      currentStreak: user.currentStreak || 0,
      longestStreak: user.longestStreak || 0
    });
  } catch (error) {
    logger.error('Error fetching points:', error);
    res.status(500).json({ error: 'Failed to fetch points data' });
  }
});

// Calculate and award historic points for a platform
router.post('/calculate-historic', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.body;
    
    if (!platform || !['spotify', 'youtube', 'instagram'].includes(platform)) {
      return res.status(400).json({ error: 'Valid platform required (spotify, youtube, instagram)' });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user has valid tokens for the platform
    if (!user.hasValidToken(platform)) {
      return res.status(400).json({ error: `Please connect your ${platform} account first` });
    }
    
    const pointsAwarded = await calculateHistoricRewards(user, platform);
    
    // Refresh user data
    const updatedUser = await User.findById(req.user.id);
    
    res.json({
      success: true,
      platform,
      pointsAwarded,
      totalPoints: updatedUser.totalPoints,
      pointsBreakdown: updatedUser.pointsBreakdown,
      message: `Successfully calculated ${pointsAwarded} points from your ${platform} history!`
    });
  } catch (error) {
    logger.error('Error calculating historic rewards:', error);
    
    if (error.message.includes('refresh token')) {
      return res.status(401).json({ 
        error: `Your ${req.body.platform} connection has expired. Please reconnect your account.`,
        code: 'TOKEN_EXPIRED'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to calculate historic rewards. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Start a live tracking session
router.post('/start-live-tracking', authenticateToken, async (req, res) => {
  try {
    const { platform, trackData } = req.body;
    const userId = req.user.id;
    
    if (!platform || !['spotify', 'youtube', 'instagram'].includes(platform)) {
      return res.status(400).json({ error: 'Valid platform required' });
    }
    
    // Check for existing active session
    const existingSession = await TrackingSession.getActiveSession(userId, platform);
    if (existingSession) {
      return res.status(400).json({ 
        error: 'You already have an active tracking session for this platform',
        sessionId: existingSession._id
      });
    }
    
    // Create new tracking session
    const trackingSession = new TrackingSession({
      userId,
      platform,
      trackData: {
        platform,
        trackId: trackData?.trackId,
        trackName: trackData?.trackName,
        artistName: trackData?.artistName,
        artistId: trackData?.artistId,
        albumName: trackData?.albumName,
        duration: trackData?.duration,
        genre: trackData?.genre,
        popularity: trackData?.popularity
      },
      multiplier: 3, // 3x multiplier for live tracking
      status: 'active',
      startedAt: new Date(),
      isActive: true
    });
    
    await trackingSession.save();
    
    // Add start event
    await trackingSession.addEvent('start', 0, { trackData });
    
    logger.info(`Started live tracking session ${trackingSession._id} for user ${userId} on ${platform}`);
    
    res.json({
      success: true,
      sessionId: trackingSession._id,
      platform,
      multiplier: trackingSession.multiplier,
      message: 'Live tracking session started! You\'ll earn 3x points for real-time listening.'
    });
  } catch (error) {
    logger.error('Error starting live tracking session:', error);
    res.status(500).json({ error: 'Failed to start live tracking session' });
  }
});

// Update live tracking session (heartbeat)
router.post('/update-live-tracking', authenticateToken, async (req, res) => {
  try {
    const { sessionId, duration, position, trackData } = req.body;
    const userId = req.user.id;
    
    if (!sessionId || !duration) {
      return res.status(400).json({ error: 'Session ID and duration are required' });
    }
    
    const pointsAwarded = await updateLiveTrackingPoints(userId, sessionId, duration, trackData);
    
    // Get updated user points
    const user = await User.findById(userId);
    
    res.json({
      success: true,
      sessionId,
      pointsAwarded,
      totalPoints: user.totalPoints,
      pointsBreakdown: user.pointsBreakdown,
      duration
    });
  } catch (error) {
    logger.error('Error updating live tracking points:', error);
    
    if (error.message.includes('Invalid')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to update live tracking points' });
  }
});

// Stop live tracking session
router.post('/stop-live-tracking', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.id;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const session = await TrackingSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Tracking session not found' });
    }
    
    if (session.userId.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to modify this session' });
    }
    
    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Session is not active' });
    }
    
    // Mark session as completed and calculate final points
    await session.markComplete();
    
    // Add stop event
    await session.addEvent('stop', session.totalDuration, { reason: 'user_requested' });
    
    // Validate and award final points (includes fraud detection)
    const finalPoints = await validateAndAwardPoints(userId, sessionId, {
      duration: session.totalDuration,
      skipCount: session.events.filter(e => e.eventType === 'skip').length
    });
    
    logger.info(`Stopped live tracking session ${sessionId} for user ${userId} (${finalPoints} total points)`);
    
    res.json({
      success: true,
      sessionId,
      totalDuration: session.totalDuration,
      pointsAwarded: session.pointsAwarded,
      completionPercentage: session.completionPercentage,
      message: `Session completed! You earned ${session.pointsAwarded} points from ${Math.floor(session.totalDuration / 60)} minutes of listening.`
    });
  } catch (error) {
    logger.error('Error stopping live tracking session:', error);
    res.status(500).json({ error: 'Failed to stop live tracking session' });
  }
});

// Get user's reward history with filters
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 20, 
      type, 
      source, 
      startDate, 
      endDate 
    } = req.query;
    
    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.min(Math.max(parseInt(limit), 1), 100);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query
    const query = { userId };
    
    if (type) query.type = type;
    if (source) query.source = source;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const [rewards, totalCount] = await Promise.all([
      RewardLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select('type source pointsAwarded description metadata awardedAt status createdAt'),
      RewardLog.countDocuments(query)
    ]);
    
    // Get summary statistics for the filtered results
    const summaryStats = await RewardLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalPoints: { $sum: '$pointsAwarded' },
          totalEntries: { $sum: 1 },
          byType: {
            $push: {
              type: '$type',
              points: '$pointsAwarded'
            }
          },
          bySource: {
            $push: {
              source: '$source',
              points: '$pointsAwarded'
            }
          }
        }
      }
    ]);
    
    const summary = summaryStats[0] || { totalPoints: 0, totalEntries: 0 };
    
    res.json({
      success: true,
      rewards,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasNext: pageNum * limitNum < totalCount,
        hasPrev: pageNum > 1
      },
      summary: {
        totalPoints: summary.totalPoints,
        totalEntries: summary.totalEntries
      }
    });
  } catch (error) {
    logger.error('Error fetching reward history:', error);
    res.status(500).json({ error: 'Failed to fetch reward history' });
  }
});

// Get points summary by time period
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeframe = '30d' } = req.query;
    
    let days;
    switch (timeframe) {
      case '7d': days = 7; break;
      case '30d': days = 30; break;
      case '90d': days = 90; break;
      case '1y': days = 365; break;
      default: days = 30;
    }
    
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Get points by source and type
    const [sourceStats, typeStats, dailyStats] = await Promise.all([
      RewardLog.aggregate([
        {
          $match: {
            userId: userId,
            createdAt: { $gte: startDate },
            status: { $in: ['processed', 'verified'] }
          }
        },
        {
          $group: {
            _id: '$source',
            totalPoints: { $sum: '$pointsAwarded' },
            count: { $sum: 1 }
          }
        }
      ]),
      RewardLog.aggregate([
        {
          $match: {
            userId: userId,
            createdAt: { $gte: startDate },
            status: { $in: ['processed', 'verified'] }
          }
        },
        {
          $group: {
            _id: '$type',
            totalPoints: { $sum: '$pointsAwarded' },
            count: { $sum: 1 }
          }
        }
      ]),
      RewardLog.aggregate([
        {
          $match: {
            userId: userId,
            createdAt: { $gte: startDate },
            status: { $in: ['processed', 'verified'] }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            totalPoints: { $sum: '$pointsAwarded' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ])
    ]);
    
    res.json({
      success: true,
      timeframe,
      stats: {
        bySource: sourceStats,
        byType: typeStats,
        daily: dailyStats
      }
    });
  } catch (error) {
    logger.error('Error fetching points summary:', error);
    res.status(500).json({ error: 'Failed to fetch points summary' });
  }
});

// Get active tracking sessions
router.get('/active-sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const activeSessions = await TrackingSession.find({
      userId,
      status: { $in: ['active', 'paused'] },
      isActive: true
    }).sort({ startedAt: -1 });
    
    res.json({
      success: true,
      sessions: activeSessions
    });
  } catch (error) {
    logger.error('Error fetching active sessions:', error);
    res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

module.exports = router;