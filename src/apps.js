const express = require('express');
const cors = require('cors');
const app = express();

// 1. Enable CORS for all origins (or specifically Vercel)
app.use(cors({
  origin: '*', // Allows requests from Vercel
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Enable JSON body parsing for course + quiz payloads
app.use(express.json());

// 3. Optional: Add a root check route so '/' displays a health check
app.get('/', (req, res) => {
  res.json({ status: 'Skillforge API is live and operational!' });
});

// Import and mount your routes
const courseRoutes = require('./routes/courses');
const enrollmentRoutes = require('./routes/enrollments');

app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));