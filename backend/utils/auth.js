const jwt = require('jsonwebtoken');
const { logger } = require('./logger');

const generateJWT = (userId, options = {}) => {
  try {
    const payload = { id: userId };
    const secret = process.env.JWT_SECRET || 'fanreward-jwt-secret';
    const defaultOptions = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };
    
    return jwt.sign(payload, secret, { ...defaultOptions, ...options });
  } catch (error) {
    logger.error('Error generating JWT:', error);
    throw error;
  }
};

const verifyJWT = (token) => {
  try {
    const secret = process.env.JWT_SECRET || 'fanreward-jwt-secret';
    return jwt.verify(token, secret);
  } catch (error) {
    logger.error('Error verifying JWT:', error);
    throw error;
  }
};

const generateRefreshToken = (userId) => {
  return generateJWT(userId, { expiresIn: '30d' });
};

module.exports = { 
  generateJWT, 
  verifyJWT, 
  generateRefreshToken 
};