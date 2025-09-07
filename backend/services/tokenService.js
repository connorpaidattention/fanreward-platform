const axios = require('axios');
const { User, PlatformConnection } = require('../models');
const { logger } = require('../utils/logger');

const refreshSpotifyToken = async (user) => {
  try {
    if (!user.spotifyTokens || !user.spotifyTokens.refreshToken) {
      throw new Error('No Spotify refresh token available');
    }

    // Check if token is still valid (with 5-minute buffer)
    if (user.spotifyTokens.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
      return user.spotifyTokens.accessToken; // Token still valid
    }

    logger.info(`Refreshing Spotify token for user ${user._id}`);

    const response = await axios.post('https://accounts.spotify.com/api/token', 
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: user.spotifyTokens.refreshToken,
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET
      }),
      {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    // Update user tokens
    user.spotifyTokens.accessToken = response.data.access_token;
    user.spotifyTokens.expiresAt = new Date(Date.now() + (response.data.expires_in * 1000));
    user.spotifyTokens.lastRefreshed = new Date();
    
    // Update refresh token if provided
    if (response.data.refresh_token) {
      user.spotifyTokens.refreshToken = response.data.refresh_token;
    }

    await user.save();
    
    // Update platform connection if exists
    await PlatformConnection.findOneAndUpdate(
      { userId: user._id, platform: 'spotify' },
      { 
        accessToken: response.data.access_token,
        tokenExpiresAt: new Date(Date.now() + (response.data.expires_in * 1000)),
        status: 'connected',
        errorCount: 0,
        lastError: null
      }
    );

    logger.info(`Successfully refreshed Spotify token for user ${user._id}`);
    return response.data.access_token;

  } catch (error) {
    logger.error('Error refreshing Spotify token:', error.response?.data || error.message);
    
    // Update connection status to expired
    await PlatformConnection.findOneAndUpdate(
      { userId: user._id, platform: 'spotify' },
      { 
        status: 'expired',
        errorCount: { $inc: 1 },
        lastError: {
          message: error.message,
          code: error.response?.status || 'TOKEN_REFRESH_FAILED',
          timestamp: new Date()
        }
      }
    );
    
    throw error;
  }
};

const refreshYouTubeToken = async (user) => {
  try {
    if (!user.youtubeTokens || !user.youtubeTokens.refreshToken) {
      throw new Error('No YouTube refresh token available');
    }

    // Check if token is still valid (with 5-minute buffer)
    if (user.youtubeTokens.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
      return user.youtubeTokens.accessToken; // Token still valid
    }

    logger.info(`Refreshing YouTube token for user ${user._id}`);

    const response = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'refresh_token',
      refresh_token: user.youtubeTokens.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    // Update user tokens
    user.youtubeTokens.accessToken = response.data.access_token;
    user.youtubeTokens.expiresAt = new Date(Date.now() + (response.data.expires_in * 1000));
    user.youtubeTokens.lastRefreshed = new Date();

    // Update refresh token if provided
    if (response.data.refresh_token) {
      user.youtubeTokens.refreshToken = response.data.refresh_token;
    }

    await user.save();

    // Update platform connection
    await PlatformConnection.findOneAndUpdate(
      { userId: user._id, platform: 'youtube' },
      { 
        accessToken: response.data.access_token,
        tokenExpiresAt: new Date(Date.now() + (response.data.expires_in * 1000)),
        status: 'connected',
        errorCount: 0,
        lastError: null
      }
    );

    logger.info(`Successfully refreshed YouTube token for user ${user._id}`);
    return response.data.access_token;

  } catch (error) {
    logger.error('Error refreshing YouTube token:', error.response?.data || error.message);
    
    // Update connection status
    await PlatformConnection.findOneAndUpdate(
      { userId: user._id, platform: 'youtube' },
      { 
        status: 'expired',
        errorCount: { $inc: 1 },
        lastError: {
          message: error.message,
          code: error.response?.status || 'TOKEN_REFRESH_FAILED',
          timestamp: new Date()
        }
      }
    );
    
    throw error;
  }
};

const refreshInstagramToken = async (user) => {
  try {
    if (!user.instagramTokens || !user.instagramTokens.refreshToken) {
      throw new Error('No Instagram refresh token available');
    }

    // Check if token is still valid (with 5-minute buffer)
    if (user.instagramTokens.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
      return user.instagramTokens.accessToken; // Token still valid
    }

    logger.info(`Refreshing Instagram token for user ${user._id}`);

    // Facebook/Instagram token refresh
    const response = await axios.post('https://graph.facebook.com/v18.0/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
      fb_exchange_token: user.instagramTokens.accessToken
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    // Update user tokens
    user.instagramTokens.accessToken = response.data.access_token;
    user.instagramTokens.expiresAt = new Date(Date.now() + (response.data.expires_in * 1000));
    user.instagramTokens.lastRefreshed = new Date();

    await user.save();

    // Update platform connection
    await PlatformConnection.findOneAndUpdate(
      { userId: user._id, platform: 'instagram' },
      { 
        accessToken: response.data.access_token,
        tokenExpiresAt: new Date(Date.now() + (response.data.expires_in * 1000)),
        status: 'connected',
        errorCount: 0,
        lastError: null
      }
    );

    logger.info(`Successfully refreshed Instagram token for user ${user._id}`);
    return response.data.access_token;

  } catch (error) {
    logger.error('Error refreshing Instagram token:', error.response?.data || error.message);
    
    // Update connection status
    await PlatformConnection.findOneAndUpdate(
      { userId: user._id, platform: 'instagram' },
      { 
        status: 'expired',
        errorCount: { $inc: 1 },
        lastError: {
          message: error.message,
          code: error.response?.status || 'TOKEN_REFRESH_FAILED',
          timestamp: new Date()
        }
      }
    );
    
    throw error;
  }
};

const validateTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const results = {
      spotify: { valid: false, refreshed: false },
      youtube: { valid: false, refreshed: false },
      instagram: { valid: false, refreshed: false }
    };

    // Check Spotify tokens
    if (user.spotifyTokens?.accessToken) {
      try {
        if (user.spotifyTokens.expiresAt <= new Date()) {
          await refreshSpotifyToken(user);
          results.spotify = { valid: true, refreshed: true };
        } else {
          results.spotify = { valid: true, refreshed: false };
        }
      } catch (error) {
        logger.warn(`Spotify token validation failed for user ${userId}:`, error.message);
        results.spotify = { valid: false, refreshed: false, error: error.message };
      }
    }

    // Check YouTube tokens
    if (user.youtubeTokens?.accessToken) {
      try {
        if (user.youtubeTokens.expiresAt <= new Date()) {
          await refreshYouTubeToken(user);
          results.youtube = { valid: true, refreshed: true };
        } else {
          results.youtube = { valid: true, refreshed: false };
        }
      } catch (error) {
        logger.warn(`YouTube token validation failed for user ${userId}:`, error.message);
        results.youtube = { valid: false, refreshed: false, error: error.message };
      }
    }

    // Check Instagram tokens
    if (user.instagramTokens?.accessToken) {
      try {
        if (user.instagramTokens.expiresAt <= new Date()) {
          await refreshInstagramToken(user);
          results.instagram = { valid: true, refreshed: true };
        } else {
          results.instagram = { valid: true, refreshed: false };
        }
      } catch (error) {
        logger.warn(`Instagram token validation failed for user ${userId}:`, error.message);
        results.instagram = { valid: false, refreshed: false, error: error.message };
      }
    }

    return results;

  } catch (error) {
    logger.error('Error validating tokens:', error);
    throw error;
  }
};

const revokeTokens = async (userId, platform) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    switch (platform) {
      case 'spotify':
        if (user.spotifyTokens?.accessToken) {
          // Revoke Spotify token
          try {
            await axios.post('https://accounts.spotify.com/api/token', 
              new URLSearchParams({
                token: user.spotifyTokens.accessToken,
                token_type_hint: 'access_token'
              }),
              {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                auth: {
                  username: process.env.SPOTIFY_CLIENT_ID,
                  password: process.env.SPOTIFY_CLIENT_SECRET
                }
              }
            );
          } catch (revokeError) {
            logger.warn('Error revoking Spotify token:', revokeError.message);
          }

          // Clear tokens from user
          user.spotifyTokens = undefined;
          user.spotifyData = undefined;
          user.spotifyId = undefined;
        }
        break;

      case 'youtube':
        if (user.youtubeTokens?.accessToken) {
          // Revoke Google token
          try {
            await axios.post(`https://oauth2.googleapis.com/revoke?token=${user.youtubeTokens.accessToken}`);
          } catch (revokeError) {
            logger.warn('Error revoking YouTube token:', revokeError.message);
          }

          // Clear tokens from user
          user.youtubeTokens = undefined;
          user.youtubeData = undefined;
          user.googleId = undefined;
        }
        break;

      case 'instagram':
        if (user.instagramTokens?.accessToken) {
          // Instagram tokens expire naturally, just clear them
          user.instagramTokens = undefined;
          user.instagramData = undefined;
          user.facebookId = undefined;
        }
        break;

      default:
        throw new Error(`Invalid platform: ${platform}`);
    }

    await user.save();

    // Update platform connection status
    await PlatformConnection.findOneAndUpdate(
      { userId, platform },
      { 
        status: 'revoked',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null
      }
    );

    logger.info(`Successfully revoked ${platform} tokens for user ${userId}`);
    return true;

  } catch (error) {
    logger.error(`Error revoking ${platform} tokens:`, error);
    throw error;
  }
};

const getTokenStatus = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const status = {};

    // Check each platform
    ['spotify', 'youtube', 'instagram'].forEach(platform => {
      const tokens = user[`${platform}Tokens`];
      
      if (tokens?.accessToken) {
        status[platform] = {
          connected: true,
          valid: tokens.expiresAt > new Date(),
          expiresAt: tokens.expiresAt,
          lastRefreshed: tokens.lastRefreshed,
          scope: tokens.scope || []
        };
      } else {
        status[platform] = {
          connected: false,
          valid: false
        };
      }
    });

    return status;

  } catch (error) {
    logger.error('Error getting token status:', error);
    throw error;
  }
};

module.exports = {
  refreshSpotifyToken,
  refreshYouTubeToken,
  refreshInstagramToken,
  validateTokens,
  revokeTokens,
  getTokenStatus
};