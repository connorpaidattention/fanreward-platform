const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
  syncedAt: { type: Date, default: Date.now },
  itemsProcessed: { type: Number, default: 0 },
  pointsAwarded: { type: Number, default: 0 },
  errors: [String],
  status: { 
    type: String, 
    enum: ['success', 'partial', 'failed'],
    default: 'success' 
  },
  duration: Number,
  lastItemTimestamp: Date
}, { _id: false });

const platformConnectionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  
  platform: { 
    type: String, 
    enum: ['spotify', 'youtube', 'instagram', 'soundcloud', 'apple_music'],
    required: true 
  },
  
  // Connection Status
  status: { 
    type: String, 
    enum: ['connected', 'disconnected', 'error', 'expired', 'revoked'],
    default: 'connected' 
  },
  
  // Platform Account Info
  platformUserId: { type: String, required: true },
  username: String,
  displayName: String,
  email: String,
  profileUrl: String,
  avatarUrl: String,
  
  // Connection Details
  connectedAt: { type: Date, default: Date.now },
  lastSyncAt: Date,
  nextSyncAt: Date,
  
  // Token Management
  accessToken: { type: String, required: true },
  refreshToken: String,
  tokenExpiresAt: Date,
  tokenScope: [String],
  
  // Sync Configuration
  syncSettings: {
    enabled: { type: Boolean, default: true },
    frequency: { type: String, enum: ['hourly', 'daily', 'weekly'], default: 'daily' },
    syncHistoric: { type: Boolean, default: true },
    syncRecentOnly: { type: Boolean, default: false },
    maxItemsPerSync: { type: Number, default: 100 }
  },
  
  // Platform-specific Data
  platformData: {
    // Spotify
    country: String,
    product: String,
    followerCount: Number,
    
    // YouTube
    channelId: String,
    subscriberCount: Number,
    viewCount: Number,
    
    // Instagram
    accountType: String,
    mediaCount: Number,
    followsCount: Number
  },
  
  // Sync History
  syncHistory: [syncLogSchema],
  
  // Error Tracking
  errorCount: { type: Number, default: 0 },
  lastError: {
    message: String,
    code: String,
    timestamp: Date,
    details: mongoose.Schema.Types.Mixed
  },
  
  // Analytics
  totalPointsAwarded: { type: Number, default: 0 },
  totalItemsProcessed: { type: Number, default: 0 },
  averageSyncDuration: Number,
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
platformConnectionSchema.index({ userId: 1, platform: 1 }, { unique: true });
platformConnectionSchema.index({ status: 1 });
platformConnectionSchema.index({ nextSyncAt: 1 });
platformConnectionSchema.index({ platformUserId: 1, platform: 1 });

// Virtuals
platformConnectionSchema.virtual('isTokenExpired').get(function() {
  return this.tokenExpiresAt && this.tokenExpiresAt < new Date();
});

platformConnectionSchema.virtual('daysSinceLastSync').get(function() {
  if (!this.lastSyncAt) return null;
  return Math.floor((Date.now() - this.lastSyncAt) / (1000 * 60 * 60 * 24));
});

// Methods
platformConnectionSchema.methods.updateTokens = function(accessToken, refreshToken, expiresIn) {
  this.accessToken = accessToken;
  if (refreshToken) this.refreshToken = refreshToken;
  this.tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000));
  return this.save();
};

platformConnectionSchema.methods.recordSync = function(itemsProcessed, pointsAwarded, errors = [], duration = 0) {
  const syncLog = {
    syncedAt: new Date(),
    itemsProcessed,
    pointsAwarded,
    errors,
    status: errors.length > 0 ? 'partial' : 'success',
    duration
  };
  
  this.syncHistory.push(syncLog);
  this.lastSyncAt = new Date();
  this.totalPointsAwarded += pointsAwarded;
  this.totalItemsProcessed += itemsProcessed;
  
  if (this.syncHistory.length > 50) {
    this.syncHistory = this.syncHistory.slice(-50);
  }
  
  const hours = this.syncSettings.frequency === 'hourly' ? 1 : 
                this.syncSettings.frequency === 'daily' ? 24 : 168;
  this.nextSyncAt = new Date(Date.now() + (hours * 60 * 60 * 1000));
  
  return this.save();
};

platformConnectionSchema.methods.recordError = function(error) {
  this.errorCount += 1;
  this.lastError = {
    message: error.message,
    code: error.code || 'UNKNOWN',
    timestamp: new Date(),
    details: error.details || {}
  };
  
  if (error.code === 'TOKEN_EXPIRED' || error.code === 'INVALID_TOKEN') {
    this.status = 'expired';
  } else if (error.code === 'PERMISSION_REVOKED') {
    this.status = 'revoked';
  } else {
    this.status = 'error';
  }
  
  return this.save();
};

// Statics
platformConnectionSchema.statics.getConnectionsForSync = function() {
  return this.find({
    status: 'connected',
    'syncSettings.enabled': true,
    nextSyncAt: { $lte: new Date() }
  });
};

platformConnectionSchema.statics.getUserConnections = function(userId) {
  return this.find({ userId }).select('-accessToken -refreshToken');
};

module.exports = mongoose.model('PlatformConnection', platformConnectionSchema);