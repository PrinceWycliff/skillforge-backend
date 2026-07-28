const express = require('express');
const cors = require('cors');

const app = express();

// Enable CORS for frontend requests (Vercel)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check root
app.get('/', (req, res) => {
  res.json({ message: 'Skillforge Backend API is online!' });
});

// Import and mount courses router
const courseRoutes = require('./routes/courses');
app.use('/api/courses', courseRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;