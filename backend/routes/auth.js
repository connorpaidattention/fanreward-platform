const express = require('express');
const passport = require('passport');
const { generateJWT } = require('../utils/auth');
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Spotify OAuth routes
router.get('/spotify', 
  passport.authenticate('spotify', {
    scope: [
      'user-read-email', 
      'user-read-recently-played', 
      'user-top-read', 
      'streaming',
      'user-read-currently-playing',
      'user-read-playback-state'
    ]
  })
);

router.get('/spotify/callback', 
  passport.authenticate('spotify', { failureRedirect: `${process.env.FRONTEND_URL || 'http://127.0.0.1:8080'}/login?error=spotify_failed` }),
  async (req, res) => {
    try {
      const token = generateJWT(req.user._id);
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://127.0.0.1:8080'}/dashboard?token=${token}&connected=spotify&success=true`;
      
      logger.info(`Spotify OAuth successful for user ${req.user._id}`);
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('Spotify callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://127.0.0.1:8080'}/login?error=spotify_callback_failed`);
    }
  }
);

// Google OAuth routes (YouTube)
router.get('/google',
  passport.authenticate('google', {
    scope: [
      'profile', 
      'email', 
      'https://www.googleapis.com/auth/youtube.readonly'
    ]
  })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL || 'http://127.0.0.1:8080'}/login?error=google_failed` }),
  async (req, res) => {
    try {
      const token = generateJWT(req.user._id);
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://127.0.0.1:8080'}/dashboard?token=${token}&connected=youtube&success=true`;
      
      logger.info(`Google OAuth successful for user ${req.user._id}`);
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('Google callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://127.0.0.1:8080'}/login?error=google_callback_failed`);
    }
  }
);

// Facebook OAuth routes (Instagram)
router.get('/facebook',
  passport.authenticate('facebook', {
    scope: [
      'email', 
      'instagram_basic', 
      'pages_read_engagement'
    ]
  })
);

router.get('/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: `${process.env.FRONTEND_URL || 'http://127.0.0.1:8080'}/login?error=facebook_failed` }),
  async (req, res) => {
    try {
      const token = generateJWT(req.user._id);
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://127.0.0.1:8080'}/dashboard?token=${token}&connected=instagram&success=true`;
      
      logger.info(`Facebook OAuth successful for user ${req.user._id}`);
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('Facebook callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://127.0.0.1:8080'}/login?error=facebook_callback_failed`);
    }
  }
);

// Get current user info (requires authentication)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user.user;
    
    res.json({
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      totalPoints: user.totalPoints || 0,
      pointsBreakdown: user.pointsBreakdown || {},
      connectedPlatforms: user.connectedPlatforms,
      currentStreak: user.currentStreak || 0,
      longestStreak: user.longestStreak || 0,
      referralCode: user.referralCode,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt
    });
  } catch (error) {
    logger.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

// Logout
router.post('/logout', authenticateToken, (req, res) => {
  req.logout((err) => {
    if (err) {
      logger.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        logger.error('Session destruction error:', sessionErr);
        return res.status(500).json({ error: 'Session cleanup failed' });
      }
      
      res.json({ 
        success: true,
        message: 'Logged out successfully' 
      });
    });
  });
});

// Refresh token endpoint
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const newToken = generateJWT(req.user.id);
    
    res.json({
      success: true,
      token: newToken,
      expiresIn: '7d'
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Check authentication status
router.get('/status', authenticateToken, (req, res) => {
  res.json({
    authenticated: true,
    user: {
      id: req.user.user._id,
      displayName: req.user.user.displayName,
      connectedPlatforms: req.user.user.connectedPlatforms
    }
  });
});

module.exports = router;