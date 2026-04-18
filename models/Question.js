const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  setNumber: { type: Number, required: true, unique: true },
  questionText: {
    English: { type: String, default: '' },
    Arabic:  { type: String, default: '' },
    French:  { type: String, default: '' }
  },
  answerA: {
    English: { type: String, default: '' },
    Arabic:  { type: String, default: '' },
    French:  { type: String, default: '' }
  },
  answerB: {
    English: { type: String, default: '' },
    Arabic:  { type: String, default: '' },
    French:  { type: String, default: '' }
  },
  answerC: {
    English: { type: String, default: '' },
    Arabic:  { type: String, default: '' },
    French:  { type: String, default: '' }
  },
  correctAnswer: { type: String, enum: ['A', 'B', 'C'], required: true },
  category: { type: String, required: true },
  questionCategory: {
    type: String,
    enum: ['Law', 'Safety', 'Sign'],
    required: true
  },
  difficultyLevel: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  isActive: { type: Boolean, default: true },
  imagePath: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Question', questionSchema);