const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'skillforge_super_secret_key_2026';

// Admin Auth Middleware
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'No authorization header provided.' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied: Administrative privileges required.' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
  }
};

// GET /api/admin/analytics - Platform Metrics
router.get('/analytics', verifyAdmin, (req, res) => {
  res.json({
    success: true,
    stats: {
      totalUsers: 148,
      activeEnrollments: 312,
      issuedCertificates: 89,
      completionRate: '84.2%'
    },
    recentCertificates: [
      { id: 'SF-9F0F463', student: 'Student Developer', course: 'Network Security 101', date: '2026-07-21' },
      { id: 'SF-D3A1B90', student: 'Jane Doe', course: 'Full-Stack Node.js', date: '2026-07-20' },
      { id: 'SF-[#A78E12]', student: 'Alex Vance', course: 'Enterprise SysAdmin', date: '2026-07-19' }
    ]
  });
});

module.exports = router;