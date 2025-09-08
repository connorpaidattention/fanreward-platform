const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { User, PlatformConnection } = require('../models');
const { logger } = require('../utils/logger');

const setupPassport = () => {
  // Log environment variables for debugging
  console.log('Environment check:', {
    spotifyClientId: process.env.SPOTIFY_CLIENT_ID ? 'SET' : 'MISSING',
    googleClientId: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'MISSING',
    facebookAppId: process.env.FACEBOOK_APP_ID ? 'SET' : 'MISSING'
  });
  
  // Don't crash the server if OAuth credentials are missing - just log warnings
  console.log('OAuth setup status:');
  console.log('- Spotify:', process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET ? 'ENABLED' : 'DISABLED');
  console.log('- Google:', process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? 'ENABLED' : 'DISABLED');
  console.log('- Facebook:', process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET ? 'ENABLED' : 'DISABLED');

  // Spotify OAuth - only set up if credentials are available
  if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
    passport.use(new SpotifyStrategy({
      clientID: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      callbackURL: process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:3000/api/auth/spotify/callback"
    }, async (accessToken, refreshToken, expires_in, profile, done) => {
    try {
      let user = await User.findOne({ spotifyId: profile.id });
      
      if (user) {
        user.spotifyTokens = {
          accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + expires_in * 1000),
          scope: profile._json.scope?.split(' ') || [],
          lastRefreshed: new Date()
        };
        
        user.spotifyData = {
          platformUserId: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          profileUrl: profile.profileUrl,
          avatarUrl: profile.photos?.[0]?.value,
          followerCount: profile.followers?.total || 0,
          lastSyncedAt: new Date()
        };
        
        await user.save();
      } else {
        user = await User.create({
          spotifyId: profile.id,
          email: profile.emails?.[0]?.value || `spotify_${profile.id}@fanreward.temp`,
          displayName: profile.displayName,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          spotifyTokens: {
            accessToken,
            refreshToken,
            expiresAt: new Date(Date.now() + expires_in * 1000),
            scope: profile._json.scope?.split(' ') || [],
            lastRefreshed: new Date()
          },
          spotifyData: {
            platformUserId: profile.id,
            username: profile.username,
            displayName: profile.displayName,
            profileUrl: profile.profileUrl,
            avatarUrl: profile.photos?.[0]?.value,
            followerCount: profile.followers?.total || 0,
            lastSyncedAt: new Date()
          }
        });
      }
      
      await PlatformConnection.findOneAndUpdate(
        { userId: user._id, platform: 'spotify' },
        {
          userId: user._id,
          platform: 'spotify',
          status: 'connected',
          platformUserId: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          email: profile.emails?.[0]?.value,
          profileUrl: profile.profileUrl,
          avatarUrl: profile.photos?.[0]?.value,
          accessToken,
          refreshToken,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          tokenScope: profile._json.scope?.split(' ') || [],
          connectedAt: new Date(),
          platformData: {
            country: profile.country,
            product: profile.product,
            followerCount: profile.followers?.total || 0
          }
        },
        { upsert: true, new: true }
      );
      
      logger.info(`Spotify OAuth successful for user ${user._id}`);
      return done(null, user);
    } catch (error) {
      logger.error('Spotify OAuth error:', error);
      return done(error, null);
    }
  }));
  } else {
    logger.warn('Spotify OAuth not configured - missing client credentials');
    console.log('⚠️ Spotify OAuth DISABLED - demo will work without it');
  }

  // Google OAuth (for YouTube) - only set up if credentials are available
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:3000/api/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      
      if (user) {
        user.youtubeTokens = {
          accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + 3600 * 1000),
          scope: ['https://www.googleapis.com/auth/youtube.readonly'],
          lastRefreshed: new Date()
        };
        
        user.youtubeData = {
          platformUserId: profile.id,
          username: profile.emails?.[0]?.value,
          displayName: profile.displayName,
          avatarUrl: profile.photos?.[0]?.value,
          lastSyncedAt: new Date()
        };
        
        await user.save();
      } else {
        user = await User.create({
          googleId: profile.id,
          email: profile.emails?.[0]?.value,
          displayName: profile.displayName,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          youtubeTokens: {
            accessToken,
            refreshToken,
            expiresAt: new Date(Date.now() + 3600 * 1000),
            scope: ['https://www.googleapis.com/auth/youtube.readonly'],
            lastRefreshed: new Date()
          },
          youtubeData: {
            platformUserId: profile.id,
            username: profile.emails?.[0]?.value,
            displayName: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
            lastSyncedAt: new Date()
          }
        });
      }
      
      await PlatformConnection.findOneAndUpdate(
        { userId: user._id, platform: 'youtube' },
        {
          userId: user._id,
          platform: 'youtube',
          status: 'connected',
          platformUserId: profile.id,
          displayName: profile.displayName,
          email: profile.emails?.[0]?.value,
          avatarUrl: profile.photos?.[0]?.value,
          accessToken,
          refreshToken,
          tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
          tokenScope: ['https://www.googleapis.com/auth/youtube.readonly'],
          connectedAt: new Date()
        },
        { upsert: true, new: true }
      );
      
      logger.info(`Google OAuth successful for user ${user._id}`);
      return done(null, user);
    } catch (error) {
      logger.error('Google OAuth error:', error);
      return done(error, null);
    }
  }));
  } else {
    logger.warn('Google OAuth not configured - missing client credentials');
    console.log('⚠️ Google OAuth DISABLED - demo will work without it');
  }

  // Facebook OAuth (for Instagram) - only set up if credentials are available
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_REDIRECT_URI || "http://127.0.0.1:3000/api/auth/facebook/callback",
      profileFields: ['id', 'emails', 'name', 'picture']
    }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ facebookId: profile.id });
      
      if (user) {
        user.instagramTokens = {
          accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + 3600 * 1000),
          scope: ['email', 'instagram_basic'],
          lastRefreshed: new Date()
        };
        
        user.instagramData = {
          platformUserId: profile.id,
          username: profile.username,
          displayName: `${profile.name.givenName} ${profile.name.familyName}`,
          avatarUrl: profile.photos?.[0]?.value,
          lastSyncedAt: new Date()
        };
        
        await user.save();
      } else {
        user = await User.create({
          facebookId: profile.id,
          email: profile.emails?.[0]?.value,
          displayName: `${profile.name.givenName} ${profile.name.familyName}`,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          instagramTokens: {
            accessToken,
            refreshToken,
            expiresAt: new Date(Date.now() + 3600 * 1000),
            scope: ['email', 'instagram_basic'],
            lastRefreshed: new Date()
          },
          instagramData: {
            platformUserId: profile.id,
            username: profile.username,
            displayName: `${profile.name.givenName} ${profile.name.familyName}`,
            avatarUrl: profile.photos?.[0]?.value,
            lastSyncedAt: new Date()
          }
        });
      }
      
      await PlatformConnection.findOneAndUpdate(
        { userId: user._id, platform: 'instagram' },
        {
          userId: user._id,
          platform: 'instagram',
          status: 'connected',
          platformUserId: profile.id,
          displayName: `${profile.name.givenName} ${profile.name.familyName}`,
          email: profile.emails?.[0]?.value,
          avatarUrl: profile.photos?.[0]?.value,
          accessToken,
          refreshToken,
          tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
          tokenScope: ['email', 'instagram_basic'],
          connectedAt: new Date(),
          platformData: {
            accountType: 'PERSONAL'
          }
        },
        { upsert: true, new: true }
      );
      
      logger.info(`Facebook OAuth successful for user ${user._id}`);
      return done(null, user);
    } catch (error) {
      logger.error('Facebook OAuth error:', error);
      return done(error, null);
    }
  }));
  } else {
    logger.warn('Facebook OAuth not configured - missing client credentials');
    console.log('⚠️ Facebook OAuth DISABLED - demo will work without it');
  }

  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      logger.error('User deserialization error:', error);
      done(error, null);
    }
  });
};

module.exports = { setupPassport };