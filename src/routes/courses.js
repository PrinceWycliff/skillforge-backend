const express = require('express');
const router = express.Router();
const Course = require('../models/Course');

// GET /api/courses - Fetch all courses for Catalog
router.get('/', async (req, res) => {
  try {
    const courses = await Course.findAll();
    res.json(courses);
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ message: 'Server error retrieving courses.' });
  }
});

// POST /api/courses - Create course from Instructor Studio
router.post('/', async (req, res) => {
  const { title, description, category, thumbnail } = req.body;

  if (!title || !description) {
    return res.status(400).json({ message: 'Title and description are required.' });
  }

  try {
    const newCourse = await Course.create({ title, description, category, thumbnail });
    res.status(201).json({ message: 'Course published successfully!', course: newCourse });
  } catch (err) {
    console.error('Error creating course:', err);
    res.status(500).json({ message: 'Failed to create course.' });
  }
});

module.exports = router;