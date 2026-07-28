const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/courses
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM courses ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ message: 'Server error retrieving courses.' });
  }
});

// POST /api/courses
router.post('/', async (req, res) => {
  const { title, description, category, thumbnail, lessons, quiz } = req.body;

  if (!title || !description) {
    return res.status(400).json({ message: 'Title and description are required.' });
  }

  try {
    // Stringify complex arrays if storing in standard TEXT or JSONB columns
    const lessonsJson = JSON.stringify(lessons || []);
    const quizJson = JSON.stringify(quiz || []);

    const newCourse = await db.query(
      `INSERT INTO courses (title, description, category, thumbnail, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [title, description, category || 'General', thumbnail || '']
    );

    res.status(201).json({
      message: 'Course published successfully!',
      course: newCourse.rows[0],
    });
  } catch (err) {
    console.error('Error creating course in DB:', err);
    res.status(500).json({ message: 'Database error creating course.', error: err.message });
  }
});

module.exports = router;