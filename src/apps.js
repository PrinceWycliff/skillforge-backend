const express = require('express');
const cors = require('cors');
const app = express();

// 1. Enable CORS for all origins and HTTP methods (handles preflight OPTIONS requests)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Parse incoming JSON requests (increase limit for lessons + quiz arrays)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Health check route
app.get('/', (req, res) => {
  res.json({ message: 'Skillforge Backend API is online!' });
});

// 4. Routes
const courseRoutes = require('./routes/courses');
const enrollmentRoutes = require('./routes/enrollments');

app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));