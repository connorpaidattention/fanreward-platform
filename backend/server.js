const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const rewardRoutes = require('./routes/rewards');
const platformRoutes = require('./routes/platforms');
const adminRoutes = require('./routes/admin');
const { connectDB } = require('./config/database');
const { setupPassport } = require('./config/passport');
const { logger } = require('./utils/logger');
const { startCronJobs } = require('./services/cronJobs');
const { authenticateSocket } = require('./middleware/socketAuth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || "http://127.0.0.1:8080",
      process.env.ADMIN_URL || "http://127.0.0.1:8081"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

connectDB();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.spotify.com", "https://www.googleapis.com"],
    },
  },
}));

app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) }}));

const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 900000,
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://127.0.0.1:8080",
    process.env.ADMIN_URL || "http://127.0.0.1:8081"
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fanreward-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/fanreward-platform'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

setupPassport();
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Socket.IO for real-time features
io.use(authenticateSocket);

io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);
  
  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
    logger.info(`User ${userId} joined their room`);
  });
  
  socket.on('start-live-tracking', async (data) => {
    const { userId, platform, trackData } = data;
    
    try {
      const { TrackingSession } = require('./models');
      
      const trackingSession = new TrackingSession({
        userId,
        platform,
        trackData,
        multiplier: 3,
        status: 'active'
      });
      
      await trackingSession.save();
      socket.join(`tracking-${trackingSession._id}`);
      
      io.to(`user-${userId}`).emit('tracking-started', {
        sessionId: trackingSession._id,
        multiplier: 3
      });
      
    } catch (error) {
      logger.error('Error starting live tracking:', error);
      socket.emit('tracking-error', { message: 'Failed to start tracking' });
    }
  });
  
  socket.on('update-live-tracking', async (data) => {
    const { sessionId, duration, position } = data;
    
    try {
      const { TrackingSession, User } = require('./models');
      const session = await TrackingSession.findById(sessionId);
      
      if (session && session.status === 'active') {
        session.totalDuration += duration;
        const points = Math.floor(duration / 30) * session.multiplier;
        session.pointsAwarded += points;
        
        await session.save();
        
        const user = await User.findById(session.userId);
        user.totalPoints += points;
        user.pointsBreakdown.liveTracking += points;
        await user.save();
        
        io.to(`user-${session.userId}`).emit('points-updated', {
          pointsAwarded: points,
          totalPoints: user.totalPoints,
          sessionId
        });
      }
    } catch (error) {
      logger.error('Error updating live tracking:', error);
    }
  });
  
  socket.on('stop-live-tracking', async (data) => {
    const { sessionId } = data;
    
    try {
      const { TrackingSession } = require('./models');
      const session = await TrackingSession.findById(sessionId);
      
      if (session) {
        session.status = 'completed';
        session.endedAt = new Date();
        session.isActive = false;
        await session.save();
        
        io.to(`user-${session.userId}`).emit('tracking-stopped', { sessionId });
      }
    } catch (error) {
      logger.error('Error stopping live tracking:', error);
    }
  });
  
  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
});

// Serve static files
app.use(express.static('frontend/public'));
app.use('/admin', express.static('admin'));

// Serve frontend index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Serve admin dashboard for /admin route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

app.use((err, req, res, next) => {
  logger.error('Global error handler:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

if (process.env.ENABLE_BACKGROUND_JOBS === 'true') {
  startCronJobs();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`FanReward Platform server running on port ${PORT}`);
});

module.exports = { app, io, server };