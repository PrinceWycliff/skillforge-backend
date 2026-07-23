const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// Correct DB import in any route file inside src/routes/:
const db = require('../config/db');
const authMiddleware = require('../middleware/auth');

// REGISTER
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
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
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

// LOGIN
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
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
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

// SET FOCUS AREAS (POST-ONBOARDING)
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