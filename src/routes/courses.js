const express = require('express');
const router = express.Router();
const db = require('../config/db'); // or your pg pool connection

// GET /api/courses
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM courses ORDER BY id DESC');
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/courses error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/courses
router.post('/', async (req, res) => {
  console.log('Incoming POST payload:', req.body);
  const { title, description, category, thumbnail, lessons, quiz } = req.body;

  if (!title || !description) {
    return res.status(400).json({ success: false, message: 'Title and description are required.' });
  }

  try {
    // Stringify JSON fields safely if storing complex objects in text/jsonb columns
    const lessonsData = JSON.stringify(lessons || []);
    const quizData = JSON.stringify(quiz || []);

    // Try basic insert first (adjust column names if needed)
    const newCourse = await db.query(
      `INSERT INTO courses (title, description, category, thumbnail)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, description, category || 'General', thumbnail || '']
    );

    return res.status(201).json({
      success: true,
      message: 'Course published successfully!',
      data: newCourse.rows[0]
    });
  } catch (err) {
    console.error('POST /api/courses Database Error:', err);
    // Returning explicit JSON status ensures CORS headers stay attached!
    return res.status(500).json({ 
      success: false, 
      message: 'Database insertion error: ' + err.message 
    });
  }
});

module.exports = router;