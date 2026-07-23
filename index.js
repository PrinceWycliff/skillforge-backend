const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Sample Course Catalog Endpoint
const courses = [
  {
    id: 'net-sec-101',
    title: 'Network Security & Infrastructure',
    category: 'Cybersecurity',
    duration: '6.5 hours',
    rating: 4.9,
    modules: [
      { id: 'mod-1', title: 'Architecture & Protocol Fundamentals', videoUrl: '' },
      { id: 'mod-2', title: 'ACL & NAT Configuration', videoUrl: '' },
      { id: 'mod-3', title: 'Live Infrastructure Auditing', videoUrl: '' }
    ]
  },
  {
    id: 'fullstack-node',
    title: 'Full-Stack JavaScript Engineering',
    category: 'Web Development',
    duration: '8.0 hours',
    rating: 4.8,
    modules: [
      { id: 'mod-1', title: 'Node.js & Express Architecture', videoUrl: '' },
      { id: 'mod-2', title: 'RESTful API Routing', videoUrl: '' }
    ]
  }
];

// GET All Courses
app.get('/api/courses', (req, res) => {
  res.json({ success: true, data: courses });
});

// GET Single Course by ID
app.get('/api/courses/:id', (req, res) => {
  const course = courses.find(c => c.id === req.params.id);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  res.json({ success: true, data: course });
});

// POST Quiz Submission & Mastery Check (Requires >= 80% to pass)
app.post('/api/quiz/submit', (req, res) => {
  const { userId, courseId, answers } = req.body;
  
  // Calculate score (Simulated validation logic)
  const score = 85; 
  const passed = score >= 80;

  res.json({
    success: true,
    score,
    passed,
    message: passed 
      ? 'Assessment passed! Progress recorded and certificate unlocked.' 
      : 'Score below 80%. Please review the material and try again.'
  });
});

const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

const instructorRoutes = require('./routes/instructor');
app.use('/api/instructor', instructorRoutes);

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const certificateRoutes = require('./routes/certificates');
app.use('/api/certificates', certificateRoutes);

app.listen(PORT, () => {
  console.log(`⚡ Skillforge Backend running on http://localhost:${PORT}`);
});