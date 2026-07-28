const express = require('express');
const cors = require('cors');

let app;

try {
  // Try importing src/app.js if available
  app = require('./src/app');
} catch (e) {
  // Fallback setup directly inside index.js
  app = express();
  
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const courseRoutes = require('./src/routes/courses');
  app.use('/api/courses', courseRoutes);
}

// Ensure root handler is active regardless
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Skillforge Backend API is running smoothly!'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Skillforge Server running on port ${PORT}`);
});