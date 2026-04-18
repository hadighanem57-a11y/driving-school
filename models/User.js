const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'school', 'student'],
    required: true
  },
  phone: { type: String },
  address: { type: String },
  schoolName: { type: String },
  licenseNumber: { type: String },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  studentId: { type: String },
  category: {
    type: String,
    enum: ['A', 'A1', 'B', 'B1', 'C', 'C1', 'CE', 'D', 'D1', 'Z', 'Z1']
  },
  language: {
    type: String,
    enum: ['English', 'Arabic', 'French'],
    default: 'English'
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);