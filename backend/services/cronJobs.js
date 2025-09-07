const cron = require('node-cron');
const { PlatformConnection, User, TrackingSession, RewardLog } = require('../models');
const { calculateHistoricRewards, calculateStreakBonus } = require('./rewardService');
const { validateTokens } = require('./tokenService');
const { logger } = require('../utils/logger');

let cronJobsStarted = false;

const syncPlatformData = async () => {
  try {
    logger.info('Starting scheduled platform data sync...');
    
    const connectionsToSync = await PlatformConnection.getConnectionsForSync();
    logger.info(`Found ${connectionsToSync.length} connections to sync`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const connection of connectionsToSync) {
      try {
        const startTime = Date.now();
        const user = await User.findById(connection.userId);
        
        if (!user || !user.isActive || user.isDeleted) {
          logger.warn(`Skipping sync for inactive/deleted user: ${connection.userId}`);
          continue;
        }

        // Validate and refresh tokens if needed
        await validateTokens(user._id);
        
        // Calculate historic rewards
        const pointsAwarded = await calculateHistoricRewards(user, connection.platform);
        const syncDuration = Date.now() - startTime;
        
        // Record successful sync
        await connection.recordSync(1, pointsAwarded, [], syncDuration);
        
        // Calculate streak bonus
        await calculateStreakBonus(user._id);
        
        successCount++;
        logger.info(`Successfully synced ${connection.platform} for user ${user._id} (${pointsAwarded} points, ${syncDuration}ms)`);
        
      } catch (error) {
        errorCount++;
        logger.error(`Error syncing ${connection.platform} for user ${connection.userId}:`, error);
        
        // Record sync error
        try {
          await connection.recordError({
            message: error.message,
            code: error.code || 'SYNC_ERROR',
            details: { 
              stack: error.stack,
              timestamp: new Date().toISOString()
            }
          });
        } catch (recordError) {
          logger.error('Error recording sync failure:', recordError);
        }
      }
      
      // Add small delay between syncs to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.info(`Platform sync completed: ${successCount} successful, ${errorCount} failed`);
    
  } catch (error) {
    logger.error('Error in scheduled platform sync:', error);
  }
};

const cleanupExpiredSessions = async () => {
  try {
    logger.info('Starting cleanup of expired tracking sessions...');
    
    // Mark sessions as abandoned if they've been active for more than 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    const abandonedResult = await TrackingSession.updateMany(
      {
        status: { $in: ['active', 'paused'] },
        startedAt: { $lt: twoHoursAgo }
      },
      {
        $set: {
          status: 'abandoned',
          endedAt: new Date(),
          isActive: false
        }
      }
    );
    
    if (abandonedResult.modifiedCount > 0) {
      logger.info(`Marked ${abandonedResult.modifiedCount} sessions as abandoned`);
    }
    
    // Delete old abandoned and error sessions (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const deleteResult = await TrackingSession.deleteMany({
      status: { $in: ['abandoned', 'error'] },
      createdAt: { $lt: sevenDaysAgo }
    });
    
    if (deleteResult.deletedCount > 0) {
      logger.info(`Deleted ${deleteResult.deletedCount} old tracking sessions`);
    }
    
  } catch (error) {
    logger.error('Error cleaning up expired sessions:', error);
  }
};

const cleanupOldRewardLogs = async () => {
  try {
    logger.info('Starting cleanup of old reward logs...');
    
    // Delete reward logs older than 90 days (keep for audit purposes)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    
    const deleteResult = await RewardLog.deleteMany({
      status: { $in: ['processed', 'verified'] },
      createdAt: { $lt: ninetyDaysAgo }
    });
    
    if (deleteResult.deletedCount > 0) {
      logger.info(`Deleted ${deleteResult.deletedCount} old reward logs`);
    }
    
  } catch (error) {
    logger.error('Error cleaning up old reward logs:', error);
  }
};

const updateUserStats = async () => {
  try {
    logger.info('Starting user statistics update...');
    
    // Get users who need stats updates (active users with recent activity)
    const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUsers = await User.find({
      isActive: true,
      isDeleted: false,
      lastActiveAt: { $gte: recentDate }
    }).select('_id');
    
    let updatedCount = 0;
    
    for (const user of activeUsers) {
      try {
        // Get user's session statistics
        const sessionStats = await TrackingSession.aggregate([
          {
            $match: {
              userId: user._id,
              status: 'completed'
            }
          },
          {
            $group: {
              _id: null,
              totalSessions: { $sum: 1 },
              totalListeningTime: { $sum: '$totalDuration' },
              avgSessionLength: { $avg: '$totalDuration' }
            }
          }
        ]);
        
        if (sessionStats.length > 0) {
          const stats = sessionStats[0];
          
          await User.findByIdAndUpdate(user._id, {
            totalTrackedSessions: stats.totalSessions,
            totalListeningTime: Math.floor(stats.totalListeningTime / 60), // Convert to minutes
            averageSessionLength: Math.floor(stats.avgSessionLength / 60) // Convert to minutes
          });
          
          updatedCount++;
        }
        
      } catch (userError) {
        logger.warn(`Error updating stats for user ${user._id}:`, userError.message);
      }
    }
    
    logger.info(`Updated statistics for ${updatedCount} users`);
    
  } catch (error) {
    logger.error('Error updating user statistics:', error);
  }
};

const checkTokenExpirations = async () => {
  try {
    logger.info('Checking for expiring tokens...');
    
    // Find connections with tokens expiring in the next 24 hours
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const expiringConnections = await PlatformConnection.find({
      status: 'connected',
      tokenExpiresAt: { $lte: tomorrow, $gt: new Date() }
    });
    
    let refreshedCount = 0;
    
    for (const connection of expiringConnections) {
      try {
        const user = await User.findById(connection.userId);
        if (user && user.isActive && !user.isDeleted) {
          await validateTokens(user._id);
          refreshedCount++;
        }
      } catch (error) {
        logger.warn(`Failed to refresh token for connection ${connection._id}:`, error.message);
      }
    }
    
    logger.info(`Proactively refreshed ${refreshedCount} expiring tokens`);
    
  } catch (error) {
    logger.error('Error checking token expirations:', error);
  }
};

const calculateDailyStreaks = async () => {
  try {
    logger.info('Calculating daily streaks...');
    
    // Get all active users
    const users = await User.find({
      isActive: true,
      isDeleted: false
    }).select('_id currentStreak');
    
    let processedCount = 0;
    let bonusesAwarded = 0;
    
    for (const user of users) {
      try {
        const bonusPoints = await calculateStreakBonus(user._id);
        if (bonusPoints > 0) {
          bonusesAwarded++;
        }
        processedCount++;
      } catch (error) {
        logger.warn(`Error calculating streak for user ${user._id}:`, error.message);
      }
    }
    
    logger.info(`Processed streaks for ${processedCount} users, awarded bonuses to ${bonusesAwarded} users`);
    
  } catch (error) {
    logger.error('Error calculating daily streaks:', error);
  }
};

const performDailyMaintenance = async () => {
  try {
    logger.info('Starting daily maintenance tasks...');
    
    // Run all daily maintenance tasks
    await Promise.all([
      cleanupExpiredSessions(),
      cleanupOldRewardLogs(),
      updateUserStats(),
      checkTokenExpirations(),
      calculateDailyStreaks()
    ]);
    
    logger.info('Daily maintenance completed successfully');
    
  } catch (error) {
    logger.error('Error during daily maintenance:', error);
  }
};

const startCronJobs = () => {
  if (cronJobsStarted) {
    logger.warn('Cron jobs already started');
    return;
  }

  if (process.env.NODE_ENV === 'test') {
    logger.info('Skipping cron jobs in test environment');
    return;
  }
  
  try {
    // Platform data sync every hour
    cron.schedule('0 * * * *', syncPlatformData, {
      scheduled: true,
      timezone: 'UTC'
    });
    logger.info('Scheduled platform sync job (every hour)');
    
    // Session cleanup every 30 minutes
    cron.schedule('*/30 * * * *', cleanupExpiredSessions, {
      scheduled: true,
      timezone: 'UTC'
    });
    logger.info('Scheduled session cleanup job (every 30 minutes)');
    
    // Token expiration check every 6 hours
    cron.schedule('0 */6 * * *', checkTokenExpirations, {
      scheduled: true,
      timezone: 'UTC'
    });
    logger.info('Scheduled token expiration check (every 6 hours)');
    
    // Daily maintenance at 2 AM UTC
    cron.schedule('0 2 * * *', performDailyMaintenance, {
      scheduled: true,
      timezone: 'UTC'
    });
    logger.info('Scheduled daily maintenance job (2 AM UTC)');
    
    // Weekly deep cleanup on Sunday at 3 AM UTC
    cron.schedule('0 3 * * 0', async () => {
      logger.info('Starting weekly deep cleanup...');
      
      try {
        // More aggressive cleanup for weekly run
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        // Clean up very old sessions
        const oldSessionsResult = await TrackingSession.deleteMany({
          createdAt: { $lt: thirtyDaysAgo },
          status: { $in: ['completed', 'abandoned', 'error'] }
        });
        
        logger.info(`Weekly cleanup deleted ${oldSessionsResult.deletedCount} old sessions`);
        
        // Update user rankings
        const users = await User.find({ isActive: true, isDeleted: false })
          .sort({ totalPoints: -1 });
        
        for (let i = 0; i < users.length; i++) {
          users[i]._pointsRank = i + 1;
          await users[i].save();
        }
        
        logger.info(`Updated rankings for ${users.length} users`);
        
      } catch (error) {
        logger.error('Error in weekly cleanup:', error);
      }
      
      logger.info('Weekly deep cleanup completed');
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
    logger.info('Scheduled weekly deep cleanup (Sunday 3 AM UTC)');
    
    cronJobsStarted = true;
    logger.info('All cron jobs started successfully');
    
  } catch (error) {
    logger.error('Error starting cron jobs:', error);
    throw error;
  }
};

const stopCronJobs = () => {
  try {
    cron.getTasks().forEach((task) => {
      task.stop();
    });
    
    cronJobsStarted = false;
    logger.info('All cron jobs stopped');
    
  } catch (error) {
    logger.error('Error stopping cron jobs:', error);
  }
};

// Manual trigger functions for testing
const manualSync = async (platform = null, userId = null) => {
  logger.info('Manual sync triggered', { platform, userId });
  
  if (userId && platform) {
    // Sync specific user and platform
    const connection = await PlatformConnection.findOne({ userId, platform });
    if (connection) {
      const user = await User.findById(userId);
      if (user) {
        return await calculateHistoricRewards(user, platform);
      }
    }
  } else {
    // Full sync
    return await syncPlatformData();
  }
};

module.exports = {
  startCronJobs,
  stopCronJobs,
  syncPlatformData,
  cleanupExpiredSessions,
  performDailyMaintenance,
  manualSync
};