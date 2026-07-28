const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const db = require('../config/db');


// POST /api/quiz/submit
router.post('/submit', auth, async (req, res) => {
  try {
    const { courseId, moduleId, answers, totalQuestions } = req.body;
    const userId = req.user.userId;

    // 1. Calculate percentage score
    let correctCount = 0;
    // (In production, compare answers against MongoDB Course document)
    answers.forEach(a => { if (a.isCorrect) correctCount++; });

    const scorePercentage = Math.round((correctCount / totalQuestions) * 100);
    const HAS_PASSED = scorePercentage >= 80;

    // 2. Persist to PostgreSQL module_progress
    /*
      await db.query(
        `INSERT INTO module_progress (user_id, course_id, module_id, quiz_score, passed, completed)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (user_id, course_id, module_id) 
         DO UPDATE SET quiz_score = $4, passed = $5, completed = $5`,
        [userId, courseId, moduleId, scorePercentage, HAS_PASSED]
      );
    */

    res.json({
      success: true,
      score: scorePercentage,
      passed: HAS_PASSED,
      message: HAS_PASSED
        ? 'Mastery threshold met! Next module unlocked.'
        : 'Score is below 80%. Review the video content and re-attempt.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error processing assessment.' });
  }
});

module.router = router;