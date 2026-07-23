const mongoose = require('mongoose');

const ModuleSchema = new mongoose.Schema({
  moduleId: { type: String, required: true },
  title: { type: String, required: true },
  videoUrl: { type: String, required: true }, // HLS / S3 stream URL
  duration: { type: String },
  quiz: [
    {
      question: { type: String, required: true },
      options: [{ type: String, required: true }],
      correctAnswerIndex: { type: Number, required: true }
    }
  ]
});

const CourseSchema = new mongoose.Schema({
  courseId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  category: { type: String, required: true }, // Cybersecurity, Web Dev, SysAdmin
  description: { type: String, required: true },
  duration: { type: String, required: true },
  rating: { type: Number, default: 5.0 },
  modules: [ModuleSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Course', CourseSchema);