const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { logger } = require('../utils/logger');

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    
    if (!token) {
      logger.warn('Socket connection attempt without token');
      return next(new Error('Authentication required'));
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fanreward-jwt-secret');
    const user = await User.findById(decoded.id).select('-loginAttempts -lockUntil');
    
    if (!user) {
      logger.warn(`Socket authentication failed - user not found: ${decoded.id}`);
      return next(new Error('Invalid token'));
    }
    
    if (!user.isActive || user.isDeleted) {
      logger.warn(`Socket authentication failed - inactive account: ${user._id}`);
      return next(new Error('Account inactive'));
    }
    
    if (user.isLocked) {
      logger.warn(`Socket authentication failed - locked account: ${user._id}`);
      return next(new Error('Account locked'));
    }
    
    socket.userId = user._id.toString();
    socket.user = user;
    
    logger.info(`Socket authenticated for user: ${user._id}`);
    next();
    
  } catch (error) {
    logger.error('Socket authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Token expired'));
    } else if (error.name === 'JsonWebTokenError') {
      return next(new Error('Invalid token'));
    }
    
    return next(new Error('Authentication failed'));
  }
};

module.exports = { authenticateSocket };