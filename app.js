const express = require('express');
const cors = require('cors');
const db = require('./src/config/db'); // Points to your db connection

const app = express();

// ==========================================
// AUTOMATIC DATABASE MIGRATION
// ==========================================
// Ensures password reset columns exist in PostgreSQL on startup
async function initDb() {
  try {
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP;
    `);
    console.log('✅ Password reset database columns verified successfully.');
  } catch (err) {
    console.error('⚠️ Migration notice:', err.message);
  }
}

initDb();

// 1. CORS Setup
// NOTE: app.use(cors(...)) already handles OPTIONS preflight for ALL routes.
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

// 4. GET /api/courses — list all courses (Catalog page)
app.get('/api/courses', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM courses ORDER BY id DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. GET /api/courses/:id — fetch ONE course, with its lessons + quiz (Player page)
// NOTE: returns the raw course object (not wrapped in {success, data}) because
// Player.jsx does `setCourse(data)` directly and reads `data.lessons`.
app.get('/api/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM courses WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fetch Course Error:', err);
    res.status(500).json({ message: 'Database error: ' + err.message });
  }
});

// 6. POST /api/courses — publish a course (now saves lessons + quiz too)
app.post('/api/courses', async (req, res) => {
  try {
    const { title, description, category, thumbnail, lessons, quiz } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required.' });
    }

    const query = `
      INSERT INTO courses (title, description, category, thumbnail, lessons, quiz)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      title,
      description || '',
      category || 'Web Development',
      thumbnail || '',
      JSON.stringify(lessons || []),
      JSON.stringify(quiz || []),
    ];

    const result = await db.query(query, values);

    res.status(201).json({
      success: true,
      message: 'Course published successfully!',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Database Error:', err);
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// 7. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Skillforge Server running on port ${PORT}`);
});

module.exports = app;