const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectMongoDB = require('./config/mongodb');
const authRoutes = require('./routes/auth');
const progressRoutes = require('./routes/progress');
const instructorRoutes = require('./routes/instructor');

const app = express();

// Initialize MongoDB Atlas Connection
connectMongoDB();

app.use(cors());
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