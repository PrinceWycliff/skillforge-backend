const express = require('express');
const cors = require('cors');

const app = express();

// 1. Configure CORS for cross-origin requests (Vercel -> Render)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Explicitly handle CORS preflight OPTIONS requests
app.options('*', cors());

// 2. Middleware to parse incoming request bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Root health check route
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Skillforge Backend API is running smoothly!',
  });
});

// 4. Import and mount course routes (Relative to src/)
const courseRoutes = require('./routes/courses');
app.use('/api/courses', courseRoutes);

// 5. Global fallback error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error: ' + err.message,
  });
});

module.exports = app;