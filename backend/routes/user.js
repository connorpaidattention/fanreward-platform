const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { User, RewardLog, TrackingSession, PlatformConnection } = require('../models');
const { logger } = require('../utils/logger');
const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = req.user.user;
    const rank = await User.getUserRank(user._id);
    
    res.json({
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      totalPoints: user.totalPoints || 0,
      pointsBreakdown: user.pointsBreakdown || {},
      lifetimePointsEarned: user.lifetimePointsEarned || 0,
      pointsRedeemed: user.pointsRedeemed || 0,
      currentStreak: user.currentStreak || 0,
      longestStreak: user.longestStreak || 0,
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
      connectedPlatforms: user.connectedPlatforms,
      preferences: user.preferences,
      rank: rank,
      totalListeningTime: user.totalListeningTime || 0,
      totalTrackedSessions: user.totalTrackedSessions || 0,
      averageSessionLength: user.averageSessionLength || 0,
      favoriteGenres: user.favoriteGenres || [],
      topArtistsAllTime: user.topArtistsAllTime || [],
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt
    });
  } catch (error) {
    logger.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const user = req.user.user;
    const updates = {};
    
    // Allow updating specific fields
    const allowedFields = [
      'displayName', 'firstName', 'lastName', 'username', 
      'timezone', 'preferences'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    // Validate username if being updated
    if (updates.username) {
      const existingUser = await User.findOne({ 
        username: updates.username, 
        _id: { $ne: user._id } 
      });
      
      if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      user._id, 
      updates, 
      { new: true, runValidators: true }
    ).select('-loginAttempts -lockUntil');
    
    logger.info(`User profile updated: ${user._id}`);
    res.json({ 
      success: true,
      user: updatedUser
    });
  } catch (error) {
    logger.error('Error updating user profile:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors
      });
    }
    
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const timeframe = req.query.timeframe || '30d';
    
    // Get session stats
    const sessionStats = await TrackingSession.getUserSessionStats(userId, timeframe);
    
    // Get reward stats
    const rewardStats = await RewardLog.getTotalPointsBySource(userId, timeframe);
    
    // Get recent activity
    const recentSessions = await TrackingSession.find({ userId })
      .sort({ startedAt: -1 })
      .limit(10)
      .select('platform trackData.trackName trackData.artistName pointsAwarded startedAt totalDuration');
    
    res.json({
      success: true,
      stats: {
        sessions: sessionStats,
        rewards: rewardStats,
        recentActivity: recentSessions
      }
    });
  } catch (error) {
    logger.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// Get user's reward history
router.get('/rewards', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;
    
    const rewards = await RewardLog.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('type source pointsAwarded description metadata awardedAt status');
    
    const totalCount = await RewardLog.countDocuments({ userId });
    
    res.json({
      success: true,
      rewards,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    logger.error('Error fetching reward history:', error);
    res.status(500).json({ error: 'Failed to fetch reward history' });
  }
});

// Get user's tracking sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const platform = req.query.platform;
    const status = req.query.status;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;
    
    const query = { userId };
    if (platform) query.platform = platform;
    if (status) query.status = status;
    
    const sessions = await TrackingSession.find(query)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('sessionId platform trackData startedAt endedAt totalDuration pointsAwarded status multiplier');
    
    const totalCount = await TrackingSession.countDocuments(query);
    
    res.json({
      success: true,
      sessions,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    logger.error('Error fetching user sessions:', error);
    res.status(500).json({ error: 'Failed to fetch tracking sessions' });
  }
});

// Get leaderboard
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const leaderboard = await User.getLeaderboard(limit);
    const userRank = await User.getUserRank(req.user.id);
    
    res.json({
      success: true,
      leaderboard,
      userRank: userRank || 0
    });
  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get user's platform connections
router.get('/connections', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const connections = await PlatformConnection.getUserConnections(userId);
    
    res.json({
      success: true,
      connections
    });
  } catch (error) {
    logger.error('Error fetching platform connections:', error);
    res.status(500).json({ error: 'Failed to fetch platform connections' });
  }
});

// Update last active timestamp
router.post('/heartbeat', authenticateToken, async (req, res) => {
  try {
    const user = req.user.user;
    user.lastActiveAt = new Date();
    await user.save();
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating heartbeat:', error);
    res.status(500).json({ error: 'Failed to update activity' });
  }
});

// Referral system - get referral info
router.get('/referral', authenticateToken, async (req, res) => {
  try {
    const user = req.user.user;
    
    const referredUsers = await User.find({ referredBy: user._id })
      .select('displayName totalPoints createdAt')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referredUsers,
      referralUrl: `${process.env.FRONTEND_URL || 'https://www.paidattention.xyz'}/?ref=${user.referralCode}`
    });
  } catch (error) {
    logger.error('Error fetching referral info:', error);
    res.status(500).json({ error: 'Failed to fetch referral information' });
  }
});

// Apply referral code
router.post('/referral/apply', authenticateToken, async (req, res) => {
  try {
    const { referralCode } = req.body;
    const user = req.user.user;
    
    if (user.referredBy) {
      return res.status(400).json({ error: 'Referral code already applied' });
    }
    
    if (!referralCode) {
      return res.status(400).json({ error: 'Referral code is required' });
    }
    
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    
    if (!referrer) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }
    
    if (referrer._id.equals(user._id)) {
      return res.status(400).json({ error: 'Cannot use your own referral code' });
    }
    
    // Apply referral
    user.referredBy = referrer._id;
    referrer.referralCount = (referrer.referralCount || 0) + 1;
    
    // Award referral bonus
    const bonusPoints = 500;
    user.totalPoints = (user.totalPoints || 0) + bonusPoints;
    user.pointsBreakdown.referrals = (user.pointsBreakdown.referrals || 0) + bonusPoints;
    
    referrer.totalPoints = (referrer.totalPoints || 0) + bonusPoints;
    referrer.pointsBreakdown.referrals = (referrer.pointsBreakdown.referrals || 0) + bonusPoints;
    
    await Promise.all([user.save(), referrer.save()]);
    
    // Log referral rewards
    await RewardLog.create([
      {
        userId: user._id,
        type: 'referral',
        source: 'system',
        pointsAwarded: bonusPoints,
        basePoints: bonusPoints,
        description: `Referral bonus for using code ${referralCode}`,
        metadata: { referralCode, referrerId: referrer._id }
      },
      {
        userId: referrer._id,
        type: 'referral',
        source: 'system',
        pointsAwarded: bonusPoints,
        basePoints: bonusPoints,
        description: `Referral bonus for referring ${user.displayName}`,
        metadata: { referralCode, referredUserId: user._id }
      }
    ]);
    
    logger.info(`Referral applied: ${user._id} used code ${referralCode} from ${referrer._id}`);
    
    res.json({
      success: true,
      message: `Referral code applied! You and ${referrer.displayName} each earned ${bonusPoints} points.`,
      pointsAwarded: bonusPoints,
      totalPoints: user.totalPoints
    });
  } catch (error) {
    logger.error('Error applying referral code:', error);
    res.status(500).json({ error: 'Failed to apply referral code' });
  }
});

module.exports = router;