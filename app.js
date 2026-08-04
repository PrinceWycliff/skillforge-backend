const express = require('express');
const cors = require('cors');
const db = require('./src/config/db');

const app = express();

// ==========================================
// BREVO EMAIL SERVICE CONFIGURATION
// ==========================================
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';

if (!BREVO_API_KEY) {
  console.warn('⚠️ BREVO_API_KEY environment variable is missing.');
}

// Helper function to send email directly via Brevo REST API
async function sendBrevoEmail({ to, subject, htmlContent }) {
  if (!BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is not configured in environment variables.');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Skillforge Support', email: 'dicksonprince.wycliff@gmail.com' },
      to: [{ email: to }],
      subject: subject,
      htmlContent: htmlContent,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Brevo API error (${response.status})`);
  }

  return data;
}

// ==========================================
// AUTOMATIC DATABASE MIGRATION
// ==========================================
async function initDb() {
  try {
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP,
      ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP,
      ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
    `);
    console.log('✅ User schema columns and verification fields verified successfully.');
  } catch (err) {
    console.error('⚠️ Migration notice:', err.message);
  }

  try {
    await db.query(`
      ALTER TABLE courses
      ADD COLUMN IF NOT EXISTS thumbnail TEXT;
    `);
    console.log('✅ Courses schema columns verified successfully.');
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
// AUTHENTICATION & EMAIL VERIFICATION
// ==========================================

// POST /api/auth/register
app.post(['/api/auth/register', '/api/register'], async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    // Check if user exists
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    // Generate Verification Token (24-hour expiration)
    const verificationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const verificationExpires = new Date(Date.now() + 24 * 3600000); 

    // Insert new user as unverified
    await db.query(
      `INSERT INTO users (full_name, email, password_hash, is_verified, status, verification_token, verification_expires) 
       VALUES ($1, $2, $3, false, 'pending', $4, $5)`,
      [name, email, password, verificationToken, verificationExpires]
    );

    const verifyUrl = `https://skillforge-frontend-one.vercel.app/verify-email?token=${verificationToken}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background-color: #f9f9f9;">
        <h2 style="color: #2563eb;">Welcome to Skillforge!</h2>
        <p>Hi ${name},</p>
        <p>Thank you for registering. Please confirm your email address to activate your account:</p>
        <p style="margin: 25px 0;">
          <a href="${verifyUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Verify Email Address
          </a>
        </p>
        <p>If the button above does not work, copy and paste this link into your browser:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
        <p style="font-size: 12px; color: #777;">If you did not register for Skillforge, you can safely ignore this email.</p>
      </div>
    `;

    await sendBrevoEmail({
      to: email,
      subject: 'Verify Your Skillforge Account',
      htmlContent
    });

    console.log(`📧 Verification email sent via Brevo API to ${email}`);

    res.status(201).json({
      success: true,
      message: 'Account created! Please check your email inbox to verify your account.'
    });

  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ success: false, message: 'Registration failed: ' + err.message });
  }
});

// POST /api/auth/verify-email
app.post(['/api/auth/verify-email', '/api/verify-email'], async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token is required.' });
    }

    const userResult = await db.query(
      'SELECT * FROM users WHERE verification_token = $1 AND verification_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification link.' });
    }

    // Activate Account
    await db.query(
      `UPDATE users 
       SET is_verified = true, status = 'active', verification_token = NULL, verification_expires = NULL 
       WHERE id = $1`,
      [userResult.rows[0].id]
    );

    res.json({
      success: true,
      message: 'Your email address has been successfully verified! You can now log in.'
    });

  } catch (err) {
    console.error('Email Verification Error:', err);
    res.status(500).json({ success: false, message: 'Verification error: ' + err.message });
  }
});

// ==========================================
// EMAIL PASSWORD RESET ROUTES
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

    const htmlContent = `
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
    `;

    await sendBrevoEmail({
      to: email,
      subject: 'Skillforge Account Password Reset',
      htmlContent,
    });

    console.log(`📧 Reset email sent via Brevo API to ${email}`);

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
      'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
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

// DELETE /api/courses/:id — matches what the Instructor Studio frontend calls
app.delete('/api/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM courses WHERE id = $1', [id]);
    res.json({ success: true, message: 'Course deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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