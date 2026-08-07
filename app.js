const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./src/config/db');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'skillforge-dev-secret-change-in-production';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET environment variable is missing.');
}

// ==========================================
// BREVO EMAIL SERVICE CONFIGURATION
// ==========================================
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';

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

    await db.query(`
      ALTER TABLE courses
      ADD COLUMN IF NOT EXISTS thumbnail TEXT,
      ADD COLUMN IF NOT EXISTS category VARCHAR(255) DEFAULT 'Web Development',
      ADD COLUMN IF NOT EXISTS lessons JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS quiz JSONB DEFAULT '[]';
    `);

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
    console.log('✅ Database schemas and relationship tables verified.');
  } catch (err) {
    console.error('⚠️ Database migration error:', err.message);
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

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app') || origin.endsWith('.netlify.app')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware: Verify JWT Authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired session token.' });
    }
    req.user = user;
    next();
  });
};

// Middleware: Verify Admin Access
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'instructor') {
    return res.status(403).json({ success: false, message: 'Access denied. Administrative privileges required.' });
  }
  next();
};

// Root Health Check
app.get('/', (req, res) => {
  res.json({ status: 'online', message: 'Skillforge API operational' });
});

// ==========================================
// PUBLIC AUTHENTICATION (STUDENTS ONLY)
// ==========================================

// POST /api/auth/register (Forces role='student' for public signups)
app.post(['/api/auth/register', '/auth/register', '/api/register'], async (req, res) => {
  try {
    const { name, email, password } = req.body;

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

    // SECURITY: Public registration ALWAYS assigns 'student' role
    await db.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_verified, status, verification_token, verification_expires) 
       VALUES ($1, $2, $3, 'student', false, 'pending', $4, $5)`,
      [name, email, hashedPassword, verificationToken, verificationExpires]
    );

    const verifyUrl = `https://skillforge-frontend-one.vercel.app/verify-email?token=${verificationToken}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background-color: #f9f9f9;">
        <h2 style="color: #2563eb;">Welcome to Skillforge!</h2>
        <p>Hi ${name},</p>
        <p>Thank you for signing up. Please verify your email address to activate your account:</p>
        <p style="margin: 25px 0;">
          <a href="${verifyUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Verify Email Address
          </a>
        </p>
        <p>Or copy this link to your browser: <a href="${verifyUrl}">${verifyUrl}</a></p>
      </div>
    `;

    try {
      await sendBrevoEmail({ to: email, subject: 'Verify Your Skillforge Account', htmlContent });
    } catch (e) {
      console.warn('Email sending failed, but user record was created:', e.message);
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully! Please check your email inbox to verify your account.'
    });

  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ success: false, message: 'Registration failed: ' + err.message });
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
      return res.status(403).json({ success: false, message: 'Please verify your email address before logging in.' });
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

// POST /api/auth/verify-email
app.post(['/api/auth/verify-email', '/auth/verify-email'], async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token is required.' });

    const userResult = await db.query(
      'SELECT * FROM users WHERE verification_token = $1 AND verification_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification link.' });
    }

    await db.query(
      `UPDATE users SET is_verified = true, status = 'active', verification_token = NULL, verification_expires = NULL WHERE id = $1`,
      [userResult.rows[0].id]
    );

    res.json({ success: true, message: 'Email verified successfully! You may now log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// STUDENT DASHBOARD DATA API
// ==========================================

// GET /api/users/me (Fetches full logged-in user profile & enrolled dynamic courses)
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
        return res.status(404).json({ success: false, message: 'User record not found.' });
      }

      const user = userRes.rows[0];

      // Dynamic Join across enrolled courses table
      const enrolledRes = await db.query(
        `SELECT c.id, c.title, c.description, c.category, c.thumbnail, c.lessons, c.quiz, uc.progress 
         FROM user_courses uc 
         JOIN courses c ON uc.course_id::text = c.id::text 
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
      console.error('Fetch Student Dashboard Error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// POST /api/enrollments (Enrolls student into a dynamic course)
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
// COURSE MANAGEMENT ENDPOINTS
// ==========================================

app.get('/api/courses', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM courses ORDER BY id DESC');
    res.json({ success: true, data: result.rows, courses: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM courses WHERE id::text = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    res.json({ success: true, data: result.rows[0], course: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin Route: Create New Course Dynamic
app.post('/api/courses', authenticateToken, requireAdmin, async (req, res) => {
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
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// REAL-TIME ADMIN DASHBOARD API
// ==========================================

// GET /api/admin/analytics (Dynamic PostgreSQL counts)
app.get('/api/admin/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const usersCountRes = await db.query('SELECT COUNT(*) FROM users');
    const coursesCountRes = await db.query('SELECT COUNT(*) FROM courses');
    const enrollmentsCountRes = await db.query('SELECT COUNT(*) FROM user_courses');

    const totalUsers = parseInt(usersCountRes.rows[0].count, 10) || 0;
    const totalCourses = parseInt(coursesCountRes.rows[0].count, 10) || 0;
    const activeEnrollments = parseInt(enrollmentsCountRes.rows[0].count, 10) || 0;

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalCourses,
        activeEnrollments,
        completionRate: activeEnrollments > 0 ? `${Math.min(100, Math.round((activeEnrollments / (totalUsers || 1)) * 100))}%` : '0%'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/users (Lists all registered users dynamically)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT id, email, full_name as name, role, status FROM users ORDER BY id DESC');
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/users/:id/role (Secure endpoint to promote user roles)
app.put('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['student', 'admin', 'instructor'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role provided.' });
    }

    await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    res.json({ success: true, message: `User role updated to ${role} successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/users/:id
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, message: 'User account removed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Skillforge Server active on port ${PORT}`);
});

module.exports = app;