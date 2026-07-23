const express = require('express');
const router = express.Router();
const Progress = require('../models/Progress');
const authMiddleware = require('../middleware/auth');

// GET progress for a specific course
router.get('/:courseId', authMiddleware, async (req, res) => {
  try {
    const progress = await Progress.findOne({
      userId: req.user.userId,
      courseId: req.params.courseId
    });

    if (!progress) {
      return res.json({
        completedLessons: [],
        lastPlayedLessonId: null,
        lastPlaybackPositionSeconds: 0,
        overallPercentage: 0
      });
    }

    res.json(progress);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error retrieving progress document.' });
  }
});

// UPDATE playback position and completed lessons
router.post('/sync', authMiddleware, async (req, res) => {
  const { courseId, lessonId, positionSeconds, isCompleted, totalCourseLessons } = req.body;
  const userId = req.user.userId;

  try {
    let progress = await Progress.findOne({ userId, courseId });

    if (!progress) {
      progress = new Progress({ userId, courseId, completedLessons: [] });
    }

    // Update lesson position
    progress.lastPlayedLessonId = lessonId;
    progress.lastPlaybackPositionSeconds = positionSeconds;

    // Mark lesson complete if requested
    if (isCompleted && !progress.completedLessons.includes(lessonId)) {
      progress.completedLessons.push(lessonId);
    }

    // Calculate percentage
    if (totalCourseLessons > 0) {
      progress.overallPercentage = Math.round(
        (progress.completedLessons.length / totalCourseLessons) * 100
      );
    }

    progress.updatedAt = Date.now();
    await progress.save();

    res.json({ message: 'Progress updated', progress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to sync progress.' });
  }
});

module.exports = router;