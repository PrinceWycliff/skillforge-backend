const express = require('express');
const cors = require('cors');

const app = express();

// 1. Enable CORS for all origins and HTTP methods (Fixes browser network errors)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 2. Parse incoming JSON requests with increased limit for lessons/quizzes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Health check route (so hitting https://skillforge-backend-4wd6.onrender.com displays status)
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Skillforge Backend API is running smoothly!',
  });
});

// 4. Import Routes
const courseRoutes = require('./routes/courses');
const enrollmentRoutes = require('./routes/enrollments');
// Add additional route imports here if needed (e.g., authRoutes)

// 5. Mount Routes
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);

// 6. Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({
    message: 'An internal server error occurred.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 7. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Skillforge Server running on port ${PORT}`);
});

module.exports = app;