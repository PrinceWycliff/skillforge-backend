const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectMongoDB = require('./config/mongodb');
const authRoutes = require('./routes/auth');
const progressRoutes = require('./routes/progress');
const instructorRoutes = require('./routes/instructor');
const enrollmentRoutes = require('./routes/enrollments');
app.use('/api/enrollments', enrollmentRoutes);

const app = express();

// Initialize MongoDB Atlas Connection
connectMongoDB();

// Configure CORS for local dev and live Vercel frontend
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://skillforge-frontend-one.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback to allow connection during initial deployment
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/instructor', instructorRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'Skillforge API operational (Postgres & MongoDB active)' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});