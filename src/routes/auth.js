const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// DB configuration import
const db = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Configure Nodemailer Transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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
    const decodedToken = jwt.decode(idToken);
    if (!decodedToken || !decodedToken.email) {
      return res.status(400).json({ error: 'Invalid token payload' });
    }

    const email = decodedToken.email.toLowerCase();
    const fullName = decodedToken.name || email.split('@')[0];

    let result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    let user = result.rows[0];

    if (!user) {
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
        role: user.role,
      },
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
    const cleanEmail = email.trim().toLowerCase();
    const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists with this email.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await db.query(
      `INSERT INTO users (email, password_hash, full_name) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, full_name, role`,
      [cleanEmail, passwordHash, fullName]
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
    const cleanEmail = email.trim().toLowerCase();
    const result = await db.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
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
// 5. FORGOT PASSWORD (REQUEST RESET LINK)
// ==========================================
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email address is required.' });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const result = await db.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);

    // Return generic success message to prevent user enumeration
    if (result.rows.length === 0) {
      return res.status(200).json({ message: 'If that email is registered, a password reset link has been sent.' });
    }

    const user = result.rows[0];

    // Generate token valid for 1 hour
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000);

    // Save token to PostgreSQL
    await db.query(
      `UPDATE users 
       SET reset_password_token = $1, reset_password_expires = $2 
       WHERE id = $3`,
      [resetToken, expiresAt, user.id]
    );

    const clientUrl = process.env.CLIENT_URL || 'https://skillforge-frontend-one.vercel.app';
    const resetUrl = `${clientUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"SkillForge Support" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'SkillForge Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #0B1130; color: #ffffff; padding: 24px; border-radius: 8px;">
          <h2 style="color: #ffffff; margin-top: 0;">Reset Your Password</h2>
          <p style="color: #d1d5db;">You requested a password reset for your SkillForge account. Click the button below to set a new password:</p>
          <div style="margin: 24px 0;">
            <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #9ca3af; font-size: 12px;">This link will expire in 1 hour. If you did not request this, please ignore this email.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: 'If that email is registered, a password reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error processing password reset.' });
  }
});

// ==========================================
// 6. RESET PASSWORD (VERIFY TOKEN & UPDATE)
// ==========================================
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required.' });
  }

  try {
    // Check for valid, non-expired token
    const result = await db.query(
      `SELECT * FROM users 
       WHERE reset_password_token = $1 
         AND reset_password_expires > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired password reset token.' });
    }

    const user = result.rows[0];

    // Hash new password and clear token fields
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await db.query(
      `UPDATE users 
       SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL 
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    res.status(200).json({ message: 'Password updated successfully! You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error resetting password.' });
  }
});

// ==========================================
// 7. SET FOCUS AREAS (POST-ONBOARDING)
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