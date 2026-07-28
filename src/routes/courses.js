const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/courses (Notice it's '/' NOT '/api/courses')
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM courses ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ message: 'Database error retrieving courses.' });
  }
});

// POST /api/courses (Notice it's '/' NOT '/api/courses')
router.post('/', async (req, res) => {
  const { title, description, category, thumbnail } = req.body;

  if (!title || !description) {
    return res.status(400).json({ message: 'Title and description are required.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO courses (title, description, category, thumbnail, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [title, description, category || 'General', thumbnail || '']
    );

    res.status(201).json({
      message: 'Course published successfully!',
      course: result.rows[0],
    });
  } catch (err) {
    console.error('DB Error creating course:', err);
    res.status(500).json({ message: 'DB Error: ' + err.message });
  }
});

module.exports = router;