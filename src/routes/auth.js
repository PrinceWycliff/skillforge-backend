const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// DB configuration import
const db = require('../config/db');
const authMiddleware = require('../middleware/auth');

// ==========================================
// 1. GET USER PROFILE & ENROLLED COURSES
// ==========================================
router.get('/profile/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch User Info
    const userResult = await db.query(
      'SELECT id, email, full_name, role FROM users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Fetch User Enrolled Courses (with fallback if enrollments table isn't created yet)
    let enrolledCourses = [];
    try {
      const coursesResult = await db.query(
        `SELECT c.id, c.title, c.description, c.thumbnail, e.progress, e.enrolled_at
         FROM enrollments e
         JOIN courses c ON e.course_id = c.id
         WHERE e.user_id = $1`,
        [id]
      );
      enrolledCourses = coursesResult.rows;
    } catch (enrollErr) {
      console.warn('Enrollments query notice:', enrollErr.message);
      // Fallback: If table/courses are not present yet, return empty list cleanly
    }

    res.json({
      user,
      enrolledCourses,
    });
  } catch (err) {
    console.error('Error fetching dashboard profile:', err);
    res.status(500).json({ message: 'Server error loading student profile' });
  }
});

// ==========================================
// 2. FIREBASE / GOOGLE OAUTH USER SYNC
// ==========================================
router.post('/sync-user', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'Missing ID token' });
  }

  try {
    // Decode JWT payload token sent from frontend Firebase auth
    const decodedToken = jwt.decode(idToken);
    if (!decodedToken || !decodedToken.email) {
      return res.status(400).json({ error: 'Invalid token payload' });
    }

    const email = decodedToken.email;
    const fullName = decodedToken.name || email.split('@')[0];

    // Check if user exists in PostgreSQL DB
    let result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    let user = result.rows[0];

    if (!user) {
      // Create user if signing in for the first time
      const newUser = await db.query(
        `INSERT INTO users (email, full_name, password_hash) 
         VALUES ($1, $2, $3) 
         RETURNING id, email, full_name, role`,
        [email, fullName, 'firebase_oauth_account']
      );
      user = newUser.rows[0];
    }

    res.json({
      message: 'User synchronized successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Error syncing user:', err);
    res.status(500).json({ error: 'Internal server error during synchronization' });
  }
});

// ==========================================
// 3. REGISTER (EMAIL & PASSWORD)
// ==========================================
router.post('/register', async (req, res) => {
  const { email, password, fullName } = req.body;

  try {
    const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists with this email.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await db.query(
      `INSERT INTO users (email, password_hash, full_name) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, full_name, role`,
      [email, passwordHash, fullName]
    );

    const user = newUser.rows[0];

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'secretKey',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// ==========================================
// 4. LOGIN (EMAIL & PASSWORD)
// ==========================================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'secretKey',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ==========================================
// 5. SET FOCUS AREAS (POST-ONBOARDING)
// ==========================================
router.post('/focus-areas', authMiddleware, async (req, res) => {
  const { categories } = req.body;
  const userId = req.user.userId;

  try {
    for (let cat of categories) {
      await db.query(
        `INSERT INTO user_focus_areas (user_id, category) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, cat]
      );
    }
    res.json({ message: 'Focus areas set successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to record focus areas.' });
  }
});

module.exports = router;