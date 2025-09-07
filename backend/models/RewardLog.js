const mongoose = require('mongoose');

const rewardLogSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  
  // Reward Details
  type: { 
    type: String, 
    enum: ['historic_sync', 'live_tracking', 'bonus', 'referral', 'streak', 'achievement', 'manual'],
    required: true 
  },
  source: { 
    type: String, 
    enum: ['spotify', 'youtube', 'instagram', 'system', 'admin'],
    required: true 
  },
  
  // Points
  pointsAwarded: { type: Number, required: true },
  multiplier: { type: Number, default: 1 },
  basePoints: { type: Number, required: true },
  
  // Context
  description: { type: String, required: true },
  metadata: {
    trackingSessionId: mongoose.Schema.Types.ObjectId,
    trackId: String,
    trackName: String,
    artistName: String,
    platform: String,
    duration: Number,
    engagementType: String,
    isTopArtist: Boolean,
    streak: Number,
    achievement: String
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'processed', 'verified', 'disputed', 'reversed'],
    default: 'processed' 
  },
  
  // Anti-Fraud
  validationScore: { type: Number, min: 0, max: 1, default: 1 },
  fraudFlags: [String],
  verifiedAt: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Timing
  awardedAt: { type: Date, default: Date.now },
  processedAt: Date,
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
rewardLogSchema.index({ userId: 1, createdAt: -1 });
rewardLogSchema.index({ type: 1, createdAt: -1 });
rewardLogSchema.index({ source: 1, createdAt: -1 });
rewardLogSchema.index({ status: 1, createdAt: -1 });
rewardLogSchema.index({ awardedAt: -1 });

// Compound indexes
rewardLogSchema.index({ userId: 1, type: 1, createdAt: -1 });
rewardLogSchema.index({ userId: 1, source: 1, createdAt: -1 });

// Statics
rewardLogSchema.statics.getUserRewardHistory = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'displayName');
};

rewardLogSchema.statics.getTotalPointsBySource = function(userId, timeframe = '30d') {
  const since = new Date();
  since.setDate(since.getDate() - parseInt(timeframe));
  
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: since },
        status: { $in: ['processed', 'verified'] }
      }
    },
    {
      $group: {
        _id: '$source',
        totalPoints: { $sum: '$pointsAwarded' },
        count: { $sum: 1 }
      }
    }
  ]);
};

module.exports = mongoose.model('RewardLog', rewardLogSchema);