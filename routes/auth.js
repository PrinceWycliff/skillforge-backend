const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'skillforge_super_secret_key_2026';

// Mock DB for temporary storage (In production, connects to PostgreSQL)
const users = [];

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { fullName, email, password, role } = req.body;

  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'User already exists with this email.' });
  }

  const newUser = {
    id: users.length + 1,
    fullName,
    email,
    password, // Hash with bcrypt in production
    role: role || 'student'
  };

  users.push(newUser);

  // Issue JWT Token
  const token = jwt.sign(
    { userId: newUser.id, fullName: newUser.fullName, role: newUser.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    success: true,
    token,
    user: { id: newUser.id, fullName: newUser.fullName, email: newUser.email, role: newUser.role }
  });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials provided.' });
  }

  const token = jwt.sign(
    { userId: user.id, fullName: user.fullName, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    token,
    user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role }
  });
});

module.exports = router;