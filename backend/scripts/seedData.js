const mongoose = require('mongoose');
require('dotenv').config();

const { User, RewardLog, PlatformConnection } = require('../models');
const { logger } = require('../utils/logger');

const seedUsers = async () => {
  logger.info('Seeding demo users...');
  
  const demoUsers = [
    {
      email: 'demo@fanreward.com',
      displayName: 'Demo User',
      firstName: 'Demo',
      lastName: 'User',
      username: 'demouser',
      spotifyId: 'spotify_demo_123',
      totalPoints: 15420,
      pointsBreakdown: {
        spotify: 12000,
        youtube: 2400,
        instagram: 720,
        liveTracking: 300,
        bonuses: 0,
        referrals: 0
      },
      lifetimePointsEarned: 15420,
      currentStreak: 7,
      longestStreak: 21,
      isActive: true,
      isVerified: true,
      spotifyTokens: {
        accessToken: 'demo_spotify_token_' + Date.now(),
        refreshToken: 'demo_spotify_refresh_' + Date.now(),
        expiresAt: new Date(Date.now() + 3600000),
        scope: ['user-read-recently-played', 'user-top-read', 'streaming']
      },
      spotifyData: {
        platformUserId: 'spotify_demo_123',
        username: 'demouser_spotify',
        displayName: 'Demo User',
        followerCount: 127,
        lastSyncedAt: new Date(),
        isTopArtistUser: true,
        topArtists: [
          {
            id: 'artist_1',
            name: 'Olivia Rodrigo',
            popularity: 95,
            genres: ['pop', 'indie pop']
          },
          {
            id: 'artist_2', 
            name: 'The Weeknd',
            popularity: 98,
            genres: ['pop', 'r&b']
          },
          {
            id: 'artist_3',
            name: 'Taylor Swift',
            popularity: 100,
            genres: ['pop', 'country']
          }
        ]
      },
      referralCode: 'DEMO001'
    },
    {
      email: 'alice@fanreward.demo',
      displayName: 'Alice Johnson',
      firstName: 'Alice',
      lastName: 'Johnson',
      username: 'alice_music',
      totalPoints: 8750,
      pointsBreakdown: {
        spotify: 5200,
        youtube: 2800,
        instagram: 450,
        liveTracking: 300,
        bonuses: 0,
        referrals: 0
      },
      lifetimePointsEarned: 8750,
      currentStreak: 3,
      longestStreak: 15,
      isActive: true,
      referralCode: 'ALICE01'
    },
    {
      email: 'bob@fanreward.demo',
      displayName: 'Bob Smith',
      firstName: 'Bob',
      lastName: 'Smith', 
      username: 'bobsmith',
      totalPoints: 12300,
      pointsBreakdown: {
        spotify: 7200,
        youtube: 4100,
        instagram: 600,
        liveTracking: 400,
        bonuses: 0,
        referrals: 0
      },
      lifetimePointsEarned: 12300,
      currentStreak: 12,
      longestStreak: 18,
      isActive: true,
      referralCode: 'BOBSM01'
    }
  ];

  for (const userData of demoUsers) {
    try {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        const user = await User.create(userData);
        logger.info(`Created demo user: ${userData.email} (ID: ${user._id})`);
      } else {
        logger.info(`Demo user already exists: ${userData.email}`);
      }
    } catch (error) {
      logger.error(`Error creating user ${userData.email}:`, error.message);
    }
  }
};

const seedRewardLogs = async () => {
  logger.info('Seeding demo reward logs...');
  
  const demoUser = await User.findOne({ email: 'demo@fanreward.com' });
  if (!demoUser) {
    logger.warn('Demo user not found, skipping reward logs');
    return;
  }

  const rewardLogs = [
    {
      userId: demoUser._id,
      type: 'historic_sync',
      source: 'spotify',
      pointsAwarded: 1247,
      basePoints: 1247,
      multiplier: 1,
      description: 'Points from Spotify listening history',
      metadata: {
        platform: 'spotify',
        trackName: 'Good 4 U',
        artistName: 'Olivia Rodrigo',
        engagementType: 'play',
        isTopArtist: true
      },
      status: 'processed',
      awardedAt: new Date(Date.now() - 86400000) // 1 day ago
    },
    {
      userId: demoUser._id,
      type: 'live_tracking',
      source: 'spotify',
      pointsAwarded: 36,
      basePoints: 12,
      multiplier: 3,
      description: '18 minutes of live music tracking',
      metadata: {
        platform: 'spotify',
        trackName: 'Blinding Lights',
        artistName: 'The Weeknd',
        duration: 1080,
        engagementType: 'play'
      },
      status: 'processed',
      awardedAt: new Date(Date.now() - 3600000) // 1 hour ago
    },
    {
      userId: demoUser._id,
      type: 'historic_sync',
      source: 'youtube',
      pointsAwarded: 892,
      basePoints: 892,
      multiplier: 1,
      description: 'Points from YouTube watch history',
      metadata: {
        platform: 'youtube',
        engagementType: 'view'
      },
      status: 'processed',
      awardedAt: new Date(Date.now() - 7200000) // 2 hours ago
    },
    {
      userId: demoUser._id,
      type: 'bonus',
      source: 'system',
      pointsAwarded: 100,
      basePoints: 100,
      multiplier: 1,
      description: '7-day listening streak bonus',
      metadata: {
        streak: 7,
        achievement: 'weekly_streak'
      },
      status: 'processed',
      awardedAt: new Date(Date.now() - 43200000) // 12 hours ago
    }
  ];

  for (const logData of rewardLogs) {
    try {
      const existingLog = await RewardLog.findOne({ 
        userId: logData.userId, 
        description: logData.description,
        awardedAt: logData.awardedAt 
      });
      
      if (!existingLog) {
        await RewardLog.create(logData);
        logger.info(`Created reward log: ${logData.description}`);
      }
    } catch (error) {
      logger.error(`Error creating reward log:`, error.message);
    }
  }
};

const seedPlatformConnections = async () => {
  logger.info('Seeding demo platform connections...');
  
  const demoUser = await User.findOne({ email: 'demo@fanreward.com' });
  if (!demoUser) {
    logger.warn('Demo user not found, skipping platform connections');
    return;
  }

  const connections = [
    {
      userId: demoUser._id,
      platform: 'spotify',
      status: 'connected',
      platformUserId: 'spotify_demo_123',
      username: 'demouser_spotify',
      displayName: 'Demo User',
      email: 'demo@fanreward.com',
      accessToken: 'demo_spotify_access_token_' + Date.now(),
      refreshToken: 'demo_spotify_refresh_token_' + Date.now(),
      tokenExpiresAt: new Date(Date.now() + 3600000),
      tokenScope: ['user-read-recently-played', 'user-top-read', 'streaming'],
      connectedAt: new Date(Date.now() - 86400000 * 7),
      lastSyncAt: new Date(Date.now() - 3600000),
      nextSyncAt: new Date(Date.now() + 82800000),
      platformData: {
        country: 'US',
        product: 'premium',
        followerCount: 127
      },
      syncHistory: [
        {
          syncedAt: new Date(Date.now() - 3600000),
          itemsProcessed: 47,
          pointsAwarded: 94,
          status: 'success',
          duration: 2340
        },
        {
          syncedAt: new Date(Date.now() - 90000000),
          itemsProcessed: 23,
          pointsAwarded: 46,
          status: 'success',
          duration: 1890
        }
      ],
      totalPointsAwarded: 12000,
      totalItemsProcessed: 847
    },
    {
      userId: demoUser._id,
      platform: 'youtube',
      status: 'connected',
      platformUserId: 'UC_demo_channel_123',
      username: 'DemoUserYT',
      displayName: 'Demo User',
      email: 'demo@fanreward.com',
      accessToken: 'demo_youtube_access_token_' + Date.now(),
      refreshToken: 'demo_youtube_refresh_token_' + Date.now(),
      tokenExpiresAt: new Date(Date.now() + 3600000),
      tokenScope: ['https://www.googleapis.com/auth/youtube.readonly'],
      connectedAt: new Date(Date.now() - 86400000 * 5),
      lastSyncAt: new Date(Date.now() - 7200000),
      nextSyncAt: new Date(Date.now() + 79200000),
      platformData: {
        channelId: 'UC_demo_channel_123',
        subscriberCount: 0,
        viewCount: 1247
      },
      syncHistory: [
        {
          syncedAt: new Date(Date.now() - 7200000),
          itemsProcessed: 23,
          pointsAwarded: 46,
          status: 'success',
          duration: 1890
        }
      ],
      totalPointsAwarded: 2400,
      totalItemsProcessed: 234
    }
  ];

  for (const connectionData of connections) {
    try {
      const existingConnection = await PlatformConnection.findOne({
        userId: connectionData.userId,
        platform: connectionData.platform
      });
      
      if (!existingConnection) {
        await PlatformConnection.create(connectionData);
        logger.info(`Created ${connectionData.platform} connection for demo user`);
      }
    } catch (error) {
      logger.error(`Error creating ${connectionData.platform} connection:`, error.message);
    }
  }
};

const seedDatabase = async () => {
  try {
    logger.info('Starting database seeding...');
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fanreward-platform');
    logger.info('Connected to MongoDB for seeding');

    await seedUsers();
    await seedRewardLogs();
    await seedPlatformConnections();

    logger.info('Database seeding completed successfully!');
    
    // Display summary
    const [userCount, rewardCount, connectionCount] = await Promise.all([
      User.countDocuments({}),
      RewardLog.countDocuments({}),
      PlatformConnection.countDocuments({})
    ]);
    
    logger.info(`Database summary: ${userCount} users, ${rewardCount} rewards, ${connectionCount} connections`);
    
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding database:', error);
    process.exit(1);
  }
};

// Run seeding if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { 
  seedDatabase, 
  seedUsers, 
  seedRewardLogs, 
  seedPlatformConnections 
};