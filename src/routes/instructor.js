const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db'); // Live PostgreSQL Connection

const JWT_SECRET = process.env.JWT_SECRET || 'skillforge_super_secret_key_2026';

// Middleware to verify Authenticated Learner
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Authentication required to enroll.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token session.' });
  }
};

// POST /api/enroll - Register student enrollment in PostgreSQL
router.post('/enroll', verifyToken, async (req, res) => {
  const { courseId } = req.body;
  const userId = req.user.id;

  if (!courseId) {
    return res.status(400).json({ success: false, message: 'Course ID is required.' });
  }

  try {
    const queryText = `
      INSERT INTO enrollments (user_id, course_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, course_id) DO NOTHING
      RETURNING *;
    `;

    const { rows } = await db.query(queryText, [userId, courseId]);

    res.json({
      success: true,
      message: 'Enrollment successful! Track added to student dashboard.',
      enrollment: rows[0] || { userId, courseId }
    });
  } catch (err) {
    console.error('Database Error (Enrollment):', err);
    res.status(500).json({ success: false, message: 'Server error during course enrollment.' });
  }
});

module.exports = router;