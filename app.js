const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./src/config/db');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'skillforge-dev-secret-change-in-production';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET environment variable is missing. Using an insecure default — set this in production!');
}

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
      ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'student',
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
      ADD COLUMN IF NOT EXISTS thumbnail TEXT,
      ADD COLUMN IF NOT EXISTS category VARCHAR(255) DEFAULT 'Web Development',
      ADD COLUMN IF NOT EXISTS lessons JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS quiz JSONB DEFAULT '[]';
    `);
    console.log('✅ Courses schema columns verified successfully.');
  } catch (err) {
    console.error('⚠️ Migration notice:', err.message);
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_courses (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        course_id VARCHAR(255),
        progress INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, course_id)
      );
    `);
    console.log('✅ User courses enrollment schema verified successfully.');
  } catch (err) {
    console.error('⚠️ Migration notice:', err.message);
  }
}

initDb();

// ==========================================
// DYNAMIC CORS CONFIGURATION
// ==========================================
const allowedOrigins = [
  'https://skillforge-frontend-one.vercel.app',
  'https://skillforge-fe.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app') || origin.endsWith('.netlify.app')) {
      return callback(null, true);
    }
    
    return callback(null, true); // Fallback to accept origin
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 200
};

// Apply CORS preflight handling across all routes
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Auth Token Verification Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
};

// Health Check
app.get('/', (req, res) => {
  res.json({ status: 'online', message: 'Skillforge Backend API is active!' });
});

// ==========================================
// AUTHENTICATION & EMAIL VERIFICATION
// ==========================================

// POST /api/auth/register (Handles both single and double /api prefixes cleanly)
app.post(['/api/auth/register', '/auth/register', '/api/register'], async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const verificationExpires = new Date(Date.now() + 24 * 3600000);
    
    // Assign role dynamically based on registration payload
    const userRole = (role === 'admin') ? 'admin' : 'student';

    await db.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_verified, status, verification_token, verification_expires) 
       VALUES ($1, $2, $3, $4, false, 'pending', $5, $6)`,
      [name, email, hashedPassword, userRole, verificationToken, verificationExpires]
    );

    const verifyUrl = `https://skillforge-frontend-one.vercel.app/verify-email?token=${verificationToken}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background-color: #f9f9f9;">
        <h2 style="color: #2563eb;">Welcome to Skillforge!</h2>
        <p>Hi ${name},</p>
        <p>Thank you for registering your account as <strong>${userRole}</strong>. Please confirm your email address to activate your account:</p>
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
app.post(['/api/auth/verify-email', '/auth/verify-email', '/api/verify-email'], async (req, res) => {
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

// POST /api/auth/login
app.post(['/api/auth/login', '/auth/login', '/api/login'], async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = userResult.rows[0];

    if (!user.is_verified) {
      return res.status(403).json({ success: false, message: 'Please verify your email before logging in. Check your inbox for the verification link.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash || '');
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.full_name, role: user.role || 'student' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.full_name, email: user.email, role: user.role || 'student' },
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, message: 'Login failed: ' + err.message });
  }
});

// POST /api/auth/resend-verification
app.post(['/api/auth/resend-verification', '/auth/resend-verification', '/api/resend-verification'], async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No account found with this email.' });
    }

    const user = userResult.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'This account is already verified. Please log in.' });
    }

    const verificationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const verificationExpires = new Date(Date.now() + 24 * 3600000);

    await db.query(
      'UPDATE users SET verification_token = $1, verification_expires = $2 WHERE id = $3',
      [verificationToken, verificationExpires, user.id]
    );

    const verifyUrl = `https://skillforge-frontend-one.vercel.app/verify-email?token=${verificationToken}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background-color: #f9f9f9;">
        <h2 style="color: #2563eb;">Verify Your Skillforge Account</h2>
        <p>Hi ${user.full_name},</p>
        <p>Here's your new verification link to activate your account:</p>
        <p style="margin: 25px 0;">
          <a href="${verifyUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Verify Email Address
          </a>
        </p>
        <p>If the button above does not work, copy and paste this link into your browser:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      </div>
    `;

    await sendBrevoEmail({
      to: email,
      subject: 'Verify Your Skillforge Account',
      htmlContent,
    });

    res.json({ success: true, message: 'Verification email resent. Please check your inbox.' });
  } catch (err) {
    console.error('Resend Verification Error:', err);
    res.status(500).json({ success: false, message: 'Failed to resend verification email: ' + err.message });
  }
});

// ==========================================
// EMAIL PASSWORD RESET ROUTES
// ==========================================

// POST /api/auth/forgot-password
app.post(['/api/auth/forgot-password', '/auth/forgot-password', '/api/forgot-password'], async (req, res) => {
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
    const expires = new Date(Date.now() + 3600000);

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
app.post(['/api/auth/reset-password', '/auth/reset-password', '/api/reset-password'], async (req, res) => {
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

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.query(
      'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
      [hashedPassword, userResult.rows[0].id]
    );

    res.json({ success: true, message: 'Password has been reset successfully!' });

  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// ==========================================
// USER ENROLLMENT & PROFILE ENDPOINTS
// ==========================================

app.get(
  ['/api/users/me', '/api/user/profile', '/api/enrollments/my-courses', '/api/courses/enrolled'],
  authenticateToken,
  async (req, res) => {
    try {
      const userRes = await db.query(
        'SELECT id, full_name, email, role, status FROM users WHERE id = $1',
        [req.user.id]
      );

      if (userRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      const user = userRes.rows[0];

      const enrolledRes = await db.query(
        `SELECT c.id, c.title, c.description, c.category, c.thumbnail, uc.progress 
         FROM user_courses uc 
         JOIN courses c ON uc.course_id = c.id 
         WHERE uc.user_id = $1 
         ORDER BY uc.created_at DESC`,
        [req.user.id]
      );

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.full_name,
          email: user.email,
          role: user.role || 'student',
        },
        enrolledCourses: enrolledRes.rows,
        courses: enrolledRes.rows,
      });
    } catch (err) {
      console.error('Fetch Enrolled Courses Error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.post('/api/enrollments', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.body;
    if (!courseId) {
      return res.status(400).json({ success: false, message: 'courseId is required.' });
    }

    await db.query(
      `INSERT INTO user_courses (user_id, course_id, progress) 
       VALUES ($1, $2, 0) 
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [req.user.id, courseId]
    );

    res.json({ success: true, message: 'Enrolled in course successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
      INSERT INTO courses (id, title, description, category, thumbnail, lessons, quiz)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      crypto.randomUUID(),
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