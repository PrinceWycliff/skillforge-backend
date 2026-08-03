const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const db = require('./src/config/db');

const app = express();

// Initialize Resend with your API Key
const resend = new Resend(process.env.RESEND_API_KEY);

// ==========================================
// AUTOMATIC DATABASE MIGRATION
// ==========================================
async function initDb() {
  try {
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP,
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
    `);
    console.log('✅ Password reset & user status database columns verified successfully.');
  } catch (err) {
    console.error('⚠️ Migration notice:', err.message);
  }
}

initDb();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/', (req, res) => {
  res.json({ status: 'online', message: 'Skillforge Backend API is active!' });
});

// ==========================================
// AUTHENTICATION & EMAIL PASSWORD RESET
// ==========================================

// POST /api/auth/forgot-password
app.post(['/api/auth/forgot-password', '/api/forgot-password'], async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No account registered with this email address.' });
    }

    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expires = new Date(Date.now() + 3600000); // 1 hour expiration

    await db.query(
      'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE email = $3',
      [token, expires, email]
    );

    const resetUrl = `https://skillforge-frontend-one.vercel.app/reset-password?token=${token}`;

    // Send email via Resend HTTPS API
    const response = await resend.emails.send({
      from: 'Skillforge Support <onboarding@resend.dev>', // Resend default testing domain
      to: email,
      subject: 'Skillforge Account Password Reset',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background-color: #f9f9f9;">
          <h2 style="color: #2563eb;">Password Reset Request</h2>
          <p>Hello,</p>
          <p>We received a request to reset the password for your Skillforge account.</p>
          <p>Click the button below to reset your password (valid for 1 hour):</p>
          <p style="margin: 25px 0;">
            <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Reset Password
            </a>
          </p>
          <p>If the button above does not work, copy and paste this link into your browser:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
          <p style="font-size: 12px; color: #777;">If you did not request a password reset, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    console.log(`📧 Reset email sent via Resend to ${email}`);

    res.json({
      success: true,
      message: 'Password reset link has been dispatched to your email inbox.',
    });

  } catch (err) {
    console.error('Email Dispatch Error:', err);
    res.status(500).json({ success: false, message: 'Failed to send email: ' + err.message });
  }
});

// POST /api/auth/reset-password
app.post(['/api/auth/reset-password', '/api/reset-password'], async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    const userResult = await db.query(
      'SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.' });
    }

    await db.query(
      'UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
      [newPassword, userResult.rows[0].id]
    );

    res.json({ success: true, message: 'Password has been reset successfully!' });

  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// ==========================================
// PUBLIC & COURSE ROUTES
// ==========================================

app.get('/api/courses', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM courses ORDER BY id DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM courses WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Database error: ' + err.message });
  }
});

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
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// ==========================================
// ADMIN USER & CONTENT MANAGEMENT ROUTES
// ==========================================

app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await db.query('SELECT id, email, full_name as name, role, status FROM users ORDER BY id DESC');
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await db.query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);
    res.json({ success: true, message: `User status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM courses WHERE id = $1', [id]);
    res.json({ success: true, message: 'Course deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/analytics', async (req, res) => {
  try {
    const usersCount = await db.query('SELECT COUNT(*) FROM users');
    const coursesCount = await db.query('SELECT COUNT(*) FROM courses');
    
    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(usersCount.rows[0].count) || 0,
        activeEnrollments: parseInt(coursesCount.rows[0].count) * 2 || 0,
        issuedCertificates: 12,
        completionRate: '94.2%'
      },
      recentCertificates: []
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Skillforge Express Backend running on port ${PORT}`);
});

module.exports = app;