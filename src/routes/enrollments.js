const express = require('express');
const router = express.Router();
const db = require('../config/db');

// POST /api/enrollments
router.post('/', async (req, res) => {
  const { userId, courseId } = req.body;

  if (!userId || !courseId) {
    return res.status(400).json({ message: 'User ID and Course ID are required.' });
  }

  try {
    // 1. Check if enrollment already exists
    const existing = await db.query(
      'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ 
        message: 'Already enrolled in this course.',
        enrollment: existing.rows[0]
      });
    }

    // 2. Insert new enrollment record (defaulting progress to 0%)
    const newEnrollment = await db.query(
      `INSERT INTO enrollments (user_id, course_id, progress, enrolled_at)
       VALUES ($1, $2, 0, NOW())
       RETURNING *`,
      [userId, courseId]
    );

    res.status(201).json({
      message: 'Successfully enrolled in course!',
      enrollment: newEnrollment.rows[0]
    });
  } catch (err) {
    console.error('Enrollment error:', err);
    res.status(500).json({ message: 'Server error processing enrollment.' });
  }
});

module.exports = router;