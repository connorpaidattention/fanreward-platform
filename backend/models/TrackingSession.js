const mongoose = require('mongoose');

const trackDataSchema = new mongoose.Schema({
  platform: { 
    type: String, 
    enum: ['spotify', 'youtube', 'instagram', 'soundcloud', 'apple_music'],
    required: true 
  },
  trackId: String,
  trackName: String,
  artistName: String,
  artistId: String,
  albumName: String,
  duration: Number,
  genre: [String],
  popularity: Number,
  releaseDate: Date,
  isExplicit: Boolean,
  previewUrl: String,
  externalUrls: {
    spotify: String,
    youtube: String,
    soundcloud: String
  }
}, { _id: false });

const sessionEventSchema = new mongoose.Schema({
  eventType: { 
    type: String, 
    enum: ['start', 'pause', 'resume', 'skip', 'complete', 'stop'],
    required: true 
  },
  timestamp: { type: Date, default: Date.now },
  position: Number,
  pointsAwarded: { type: Number, default: 0 },
  metadata: mongoose.Schema.Types.Mixed
}, { _id: false });

const trackingSessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  
  // Session Info
  sessionId: { 
    type: String, 
    unique: true, 
    required: true,
    default: () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  platform: { 
    type: String, 
    enum: ['spotify', 'youtube', 'instagram', 'soundcloud', 'apple_music'],
    required: true 
  },
  
  // Track Data
  trackData: trackDataSchema,
  
  // Session Metrics
  startedAt: { type: Date, default: Date.now },
  endedAt: Date,
  totalDuration: { type: Number, default: 0 },
  actualDuration: Number,
  completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
  
  // Points
  basePointsRate: { type: Number, default: 1 },
  multiplier: { type: Number, default: 3 },
  pointsAwarded: { type: Number, default: 0 },
  bonusPoints: { type: Number, default: 0 },
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'paused', 'completed', 'abandoned', 'error'],
    default: 'active' 
  },
  isActive: { type: Boolean, default: true },
  isValidated: { type: Boolean, default: false },
  
  // Events Timeline
  events: [sessionEventSchema],
  
  // Quality & Validation
  quality: {
    audioQuality: String,
    bufferingEvents: { type: Number, default: 0 },
    dropouts: { type: Number, default: 0 },
    averageVolume: Number
  },
  
  // Context
  context: {
    playlist: {
      id: String,
      name: String,
      ownerName: String
    },
    device: {
      type: String,
      name: String,
      userAgent: String
    },
    location: {
      country: String,
      region: String,
      city: String,
      timezone: String
    },
    referrer: String,
    source: { type: String, default: 'web_app' }
  },
  
  // Anti-Fraud
  fraudFlags: [{
    type: { 
      type: String, 
      enum: ['suspicious_duration', 'rapid_skipping', 'bot_pattern', 'duplicate_session'] 
    },
    description: String,
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Metadata
  userAgent: String,
  ipAddress: String,
  sessionToken: String,
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
trackingSessionSchema.index({ userId: 1, startedAt: -1 });
trackingSessionSchema.index({ platform: 1, startedAt: -1 });
trackingSessionSchema.index({ status: 1, startedAt: -1 });
trackingSessionSchema.index({ sessionId: 1 }, { unique: true });
trackingSessionSchema.index({ isActive: 1, startedAt: -1 });
trackingSessionSchema.index({ 'trackData.artistId': 1 });

// Compound indexes
trackingSessionSchema.index({ userId: 1, platform: 1, startedAt: -1 });
trackingSessionSchema.index({ userId: 1, status: 1, startedAt: -1 });

// Virtuals
trackingSessionSchema.virtual('duration').get(function() {
  if (this.endedAt && this.startedAt) {
    return Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  return this.totalDuration || 0;
});

trackingSessionSchema.virtual('pointsPerMinute').get(function() {
  const minutes = this.totalDuration / 60;
  return minutes > 0 ? (this.pointsAwarded / minutes).toFixed(2) : 0;
});

trackingSessionSchema.virtual('isLongSession').get(function() {
  return this.totalDuration > 1800;
});

// Methods
trackingSessionSchema.methods.addEvent = function(eventType, position = 0, metadata = {}) {
  this.events.push({
    eventType,
    position,
    timestamp: new Date(),
    metadata
  });
  
  if (eventType === 'complete' || eventType === 'stop') {
    this.status = 'completed';
    this.endedAt = new Date();
    this.isActive = false;
  } else if (eventType === 'pause') {
    this.status = 'paused';
  } else if (eventType === 'resume') {
    this.status = 'active';
  }
  
  return this.save();
};

trackingSessionSchema.methods.calculatePoints = function() {
  const listeningTimeMinutes = this.totalDuration / 60;
  const basePoints = Math.floor(listeningTimeMinutes / 0.5);
  this.pointsAwarded = basePoints * this.multiplier;
  return this.pointsAwarded;
};

trackingSessionSchema.methods.markComplete = function() {
  this.status = 'completed';
  this.endedAt = new Date();
  this.isActive = false;
  
  if (this.trackData.duration) {
    this.completionPercentage = Math.min(100, (this.totalDuration / this.trackData.duration) * 100);
  }
  
  this.calculatePoints();
  return this.save();
};

// Statics
trackingSessionSchema.statics.getActiveSession = function(userId, platform) {
  return this.findOne({
    userId,
    platform,
    status: { $in: ['active', 'paused'] },
    isActive: true
  });
};

trackingSessionSchema.statics.getUserSessionStats = function(userId, timeframe = '30d') {
  const since = new Date();
  since.setDate(since.getDate() - parseInt(timeframe));
  
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        startedAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: '$platform',
        totalSessions: { $sum: 1 },
        totalDuration: { $sum: '$totalDuration' },
        totalPoints: { $sum: '$pointsAwarded' },
        avgDuration: { $avg: '$totalDuration' }
      }
    }
  ]);
};

module.exports = mongoose.model('TrackingSession', trackingSessionSchema);