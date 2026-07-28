const express = require('express');
const cors = require('cors');
const db = require('./src/config/db');

const app = express();

// 1. CORS Setup
// Handles both regular cross-origin requests and preflight OPTIONS automatically
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Health Check
app.get('/', (req, res) => {
  res.json({ status: 'online', message: 'Skillforge Backend API is active!' });
});

// 4. GET /api/courses
app.get('/api/courses', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM courses ORDER BY id DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/courses Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. POST /api/courses
// Includes ID auto-calculation to handle non-SERIAL primary keys safely
app.post('/api/courses', async (req, res) => {
  try {
    const { title, description, category } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required.' });
    }

    const query = `
      INSERT INTO courses (id, title, description, category)
      VALUES (
        COALESCE((SELECT MAX(id) FROM courses), 0) + 1,
        $1, $2, $3
      )
      RETURNING *
    `;
    const values = [title, description || '', category || 'Web Development'];

    const result = await db.query(query, values);

    res.status(201).json({
      success: true,
      message: 'Course published successfully!',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Database Error:', err);
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// 6. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Skillforge Server running on port ${PORT}`);
});

module.exports = app;