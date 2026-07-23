const mongoose = require('mongoose');
const db = require('../config/db');

const ProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  courseId: { type: String, required: true, index: true },
  completedLessons: [{ type: String }],
  lastPlayedLessonId: { type: String, default: null },
  lastPlaybackPositionSeconds: { type: Number, default: 0 },
  overallPercentage: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

// Ensure fast composite query lookups
ProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('Progress', ProgressSchema);