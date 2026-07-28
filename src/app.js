const express = require('express');
const cors = require('cors');

const app = express();

// 1. CORS Setup
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.options('*', cors());

// 2. Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Health Check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Skillforge Backend API is running smoothly!',
  });
});

// 4. Mount Courses Route (relative to src/)
const courseRoutes = require('./routes/courses');
app.use('/api/courses', courseRoutes);

// 5. Port Listener
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Skillforge Server running on port ${PORT}`);
});

module.exports = app;