const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db'); // Live PostgreSQL Connection

const JWT_SECRET = process.env.JWT_SECRET || 'skillforge_super_secret_key_2026';

// Middleware to verify Instructor or Admin JWT
const verifyInstructor = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'No authorization token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'instructor' && decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Instructor privileges required.' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
  }
};

// GET /api/instructor/courses - Fetch authored tracks with real enrollment counts
router.get('/courses', verifyInstructor, async (req, res) => {
  try {
    const queryText = `
      SELECT 
        c.id, 
        c.title, 
        c.category, 
        c.status,
        c.rating,
        COUNT(e.user_id)::INT AS students
      FROM courses c
      LEFT JOIN enrollments e ON c.id = e.course_id
      WHERE c.instructor_id = $1
      GROUP BY c.id;
    `;

    const { rows } = await db.query(queryText, [req.user.id]);
    res.json({ success: true, courses: rows });
  } catch (err) {
    console.error('Database Error (Fetch Courses):', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve course analytics from database.' });
  }
});

// POST /api/instructor/courses - Create and save a new track to Neon DB
router.post('/courses', verifyInstructor, async (req, res) => {
  const { title, category, description, duration } = req.body;
  const courseId = `track-${Date.now()}`;

  if (!title || !category) {
    return res.status(400).json({ success: false, message: 'Title and category are required.' });
  }

  try {
    const queryText = `
      INSERT INTO courses (id, title, category, description, duration, instructor_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'Draft')
      RETURNING *;
    `;

    const values = [courseId, title, category, description || '', duration || '4 Hours', req.user.id];
    const { rows } = await db.query(queryText, values);

    res.json({
      success: true,
      message: 'Course track created successfully!',
      course: { ...rows[0], students: 0 }
    });
  } catch (err) {
    console.error('Database Error (Create Course):', err);
    res.status(500).json({ success: false, message: 'Failed to save course track to database.' });
  }
});

module.exports = router;