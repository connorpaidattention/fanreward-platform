const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { logger } = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fanreward-jwt-secret');
    const user = await User.findById(decoded.id).select('-loginAttempts -lockUntil');
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token - user not found' });
    }
    
    if (!user.isActive || user.isDeleted) {
      return res.status(401).json({ error: 'Account is inactive' });
    }
    
    if (user.isLocked) {
      return res.status(423).json({ error: 'Account is temporarily locked' });
    }
    
    req.user = { id: user._id, user };
    next();
  } catch (error) {
    logger.error('Token authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    return res.status(403).json({ error: 'Token verification failed' });
  }
};

const authenticateAdmin = async (req, res, next) => {
  try {
    await authenticateToken(req, res, () => {});
    
    const user = req.user.user;
    
    if (!user || user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    logger.error('Admin authentication error:', error);
    return res.status(403).json({ error: 'Admin authentication failed' });
  }
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fanreward-jwt-secret');
    const user = await User.findById(decoded.id).select('-loginAttempts -lockUntil');
    
    if (user && user.isActive && !user.isDeleted && !user.isLocked) {
      req.user = { id: user._id, user };
    }
  } catch (error) {
    logger.warn('Optional auth failed:', error.message);
  }
  
  next();
};

module.exports = { 
  authenticateToken, 
  authenticateAdmin, 
  optionalAuth 
};