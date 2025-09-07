const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const tokenSchema = new mongoose.Schema({
  accessToken: { type: String, required: true },
  refreshToken: { type: String },
  expiresAt: { type: Date, required: true },
  scope: [String],
  lastRefreshed: { type: Date, default: Date.now }
}, { _id: false });

const platformDataSchema = new mongoose.Schema({
  platformUserId: String,
  username: String,
  displayName: String,
  profileUrl: String,
  avatarUrl: String,
  followerCount: Number,
  lastSyncedAt: { type: Date, default: Date.now },
  isTopArtistUser: { type: Boolean, default: false },
  topArtists: [{
    id: String,
    name: String,
    popularity: Number,
    genres: [String]
  }],
  recentActivity: [{
    type: { type: String, enum: ['play', 'view', 'like', 'share'] },
    itemId: String,
    itemName: String,
    artistName: String,
    timestamp: Date,
    duration: Number,
    pointsEarned: { type: Number, default: 0 }
  }]
}, { _id: false });

const pointsBreakdownSchema = new mongoose.Schema({
  spotify: { type: Number, default: 0 },
  youtube: { type: Number, default: 0 },
  instagram: { type: Number, default: 0 },
  liveTracking: { type: Number, default: 0 },
  bonuses: { type: Number, default: 0 },
  referrals: { type: Number, default: 0 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  // Authentication IDs
  spotifyId: { type: String, sparse: true, index: true },
  googleId: { type: String, sparse: true, index: true },
  facebookId: { type: String, sparse: true, index: true },
  
  // Basic Info
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please enter a valid email'
    }
  },
  displayName: { type: String, required: true, trim: true },
  firstName: String,
  lastName: String,
  username: { 
    type: String, 
    unique: true, 
    sparse: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-zA-Z0-9_-]+$/
  },
  
  // Platform Tokens
  spotifyTokens: tokenSchema,
  youtubeTokens: tokenSchema,
  instagramTokens: tokenSchema,
  
  // Platform Data
  spotifyData: platformDataSchema,
  youtubeData: platformDataSchema,
  instagramData: platformDataSchema,
  
  // Points System
  totalPoints: { type: Number, default: 0, min: 0 },
  pointsBreakdown: { type: pointsBreakdownSchema, default: {} },
  lifetimePointsEarned: { type: Number, default: 0, min: 0 },
  pointsRedeemed: { type: Number, default: 0, min: 0 },
  currentStreak: { type: Number, default: 0, min: 0 },
  longestStreak: { type: Number, default: 0, min: 0 },
  
  // Account Status
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  
  // Preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      rewards: { type: Boolean, default: true },
      weekly: { type: Boolean, default: true }
    },
    privacy: {
      profileVisible: { type: Boolean, default: true },
      activityVisible: { type: Boolean, default: false },
      allowDataCollection: { type: Boolean, default: true }
    },
    rewards: {
      autoRedeem: { type: Boolean, default: false },
      redeemThreshold: { type: Number, default: 1000 }
    }
  },
  
  // Tracking
  lastActiveAt: { type: Date, default: Date.now },
  lastRewardCalculation: Date,
  timezone: { type: String, default: 'UTC' },
  
  // Referral System
  referralCode: { type: String, unique: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  referralCount: { type: Number, default: 0 },
  
  // Security
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  
  // Analytics
  totalListeningTime: { type: Number, default: 0 },
  totalTrackedSessions: { type: Number, default: 0 },
  averageSessionLength: { type: Number, default: 0 },
  favoriteGenres: [String],
  topArtistsAllTime: [String],
  
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.spotifyTokens;
      delete ret.youtubeTokens;
      delete ret.instagramTokens;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ totalPoints: -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastActiveAt: -1 });
userSchema.index({ referralCode: 1 });
userSchema.index({ 'spotifyData.lastSyncedAt': 1 });
userSchema.index({ 'youtubeData.lastSyncedAt': 1 });
userSchema.index({ 'instagramData.lastSyncedAt': 1 });

// Compound indexes
userSchema.index({ isActive: 1, totalPoints: -1 });
userSchema.index({ isDeleted: 1, createdAt: -1 });

// Virtual fields
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.virtual('pointsRank').get(function() {
  return this._pointsRank || 0;
});

userSchema.virtual('connectedPlatforms').get(function() {
  const platforms = [];
  if (this.spotifyTokens?.accessToken) platforms.push('spotify');
  if (this.youtubeTokens?.accessToken) platforms.push('youtube');
  if (this.instagramTokens?.accessToken) platforms.push('instagram');
  return platforms;
});

// Pre-save middleware
userSchema.pre('save', async function(next) {
  if (this.isNew && !this.referralCode) {
    this.referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  
  if (this.isModified('totalPoints')) {
    const pointsDiff = this.totalPoints - (this.constructor._original?.totalPoints || 0);
    if (pointsDiff > 0) {
      this.lifetimePointsEarned += pointsDiff;
    }
  }
  
  next();
});

// Methods
userSchema.methods.addPoints = async function(points, source = 'general') {
  this.totalPoints += points;
  this.lifetimePointsEarned += points;
  
  if (this.pointsBreakdown[source] !== undefined) {
    this.pointsBreakdown[source] += points;
  }
  
  return this.save();
};

userSchema.methods.hasValidToken = function(platform) {
  const tokens = this[`${platform}Tokens`];
  return tokens && tokens.accessToken && tokens.expiresAt > new Date();
};

userSchema.methods.incrementLoginAttempts = function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { loginAttempts: 1, lockUntil: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

// Statics
userSchema.statics.getLeaderboard = function(limit = 10) {
  return this.find({ isActive: true, isDeleted: false })
    .sort({ totalPoints: -1 })
    .limit(limit)
    .select('displayName totalPoints createdAt');
};

userSchema.statics.getUserRank = async function(userId) {
  const user = await this.findById(userId);
  if (!user) return null;
  
  const rank = await this.countDocuments({
    totalPoints: { $gt: user.totalPoints },
    isActive: true,
    isDeleted: false
  });
  
  return rank + 1;
};

module.exports = mongoose.model('User', userSchema);