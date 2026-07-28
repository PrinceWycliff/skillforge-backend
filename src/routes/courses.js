const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Ensure this matches your DB connection path

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
  try {
    const { title, description, category, thumbnail, lessons, quiz } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Course title is required.' });
    }

    // Insert course into database
    const query = `
      INSERT INTO courses (title, description, category, thumbnail)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [title, description || '', category || 'Web Development', thumbnail || ''];

    const result = await db.query(query, values);

    return res.status(201).json({
      success: true,
      message: 'Course published successfully!',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('POST /api/courses DB error:', err);
    return res.status(500).json({
      success: false,
      message: 'Database error: ' + err.message,
    });
  }
});

module.exports = router;