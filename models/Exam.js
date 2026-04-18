const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  category: {
    type: String,
    required: true,
    index: true
  },
  language: {
    type: String,
    default: 'English'
  },
  type: {
    type: String,
    default: 'normal'
  },
  totalQuestions: {
    type: Number,
    default: 30
  },
  correctAnswers: {
    type: Number,
    default: 0
  },
  wrongAnswers: {
    type: Number,
    default: 0
  },
  score: {
    type: Number,
    default: 0
  },
  passed: {
    type: Boolean,
    default: false
  },
  timeTaken: {
    type: Number,
    default: 0
  },
  questions: [{
    questionId: mongoose.Schema.Types.ObjectId,
    setNumber: Number,
    questionText: String,
    answerA: String,
    answerB: String,
    answerC: String,
    correctAnswer: String,
    studentAnswer: String,
    isCorrect: Boolean,
    questionCategory: String,
    imagePath: String
  }],
  lawCount: {
    type: Number,
    default: 10
  },
  safetyCount: {
    type: Number,
    default: 10
  },
  signCount: {
    type: Number,
    default: 10
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  startedAt: Date
});

// Create indexes
examSchema.index({ studentId: 1, createdAt: -1 });
examSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = mongoose.model('Exam', examSchema);