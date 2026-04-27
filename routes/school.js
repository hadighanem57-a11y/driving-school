const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Exam = require('../models/Exam');
const { auth, authorize } = require('../middleware/auth');

// ✅ STATS
router.get('/stats', auth, authorize('school'), async function(req, res) {
  try {
    var schoolId = req.user._id;

    var totalStudents = await User.countDocuments({
      role: 'student',
      schoolId: schoolId,
      status: 'approved'
    });

    var pendingStudents = await User.countDocuments({
      role: 'student',
      schoolId: schoolId,
      status: 'pending'
    });

    var totalExams = await Exam.countDocuments({ schoolId: schoolId });
    var passedExams = await Exam.countDocuments({ schoolId: schoolId, passed: true });

    var categories = ['A', 'A1', 'B', 'B1', 'C', 'C1', 'CE', 'D', 'D1', 'Z', 'Z1'];
    var categoryStats = [];

    for (var i = 0; i < categories.length; i++) {
      var count = await User.countDocuments({
        role: 'student',
        schoolId: schoolId,
        category: categories[i],
        status: 'approved'
      });

      if (count > 0) {
        categoryStats.push({ category: categories[i], count: count });
      }
    }

    res.json({
      totalStudents: totalStudents,
      pendingStudents: pendingStudents,
      totalExams: totalExams,
      passedExams: passedExams,
      categoryStats: categoryStats
    });
  } catch (err) {
    console.log('SCHOOL STATS ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ ADD STUDENT - (MODIFIED: PAYMENT BYPASSED FOR TESTING)
router.post('/add-student', auth, authorize('school'), async function(req, res) {
  try {
    console.log('=== ADD STUDENT START (TESTING MODE) ===');
    
    var fullName = req.body.fullName;
    var phone = req.body.phone;
    var studentId = req.body.studentId;
    var address = req.body.address;
    var category = req.body.category;
    var rawLanguage = req.body.language;
    var password = req.body.password;
    
    // Payment fields - made optional for testing
    var paymentReceipt = req.body.paymentReceipt || 'TEST-FREE';
    var paymentMethod = req.body.paymentMethod || 'FREE';

    // ✅ Email handling
    var rawEmail = String(req.body.email || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');

    var email = rawEmail;
    if (rawEmail && rawEmail.indexOf('@') === -1) {
      email = rawEmail + '@drivingschool.com';
    }

    if (email && !email.endsWith('@drivingschool.com')) {
      return res.status(400).json({
        message: 'Student email must end with @drivingschool.com'
      });
    }

    var emailRegex = /^[a-z0-9._-]+@drivingschool\.com$/;
    if (email && !emailRegex.test(email)) {
      return res.status(400).json({
        message: 'Invalid student email format.'
      });
    }

    var languageMap = {
      en: 'English', ar: 'Arabic', fr: 'French',
      english: 'English', arabic: 'Arabic', french: 'French',
      English: 'English', Arabic: 'Arabic', French: 'French'
    };

    var language = languageMap[rawLanguage];

    if (!fullName || !phone || !studentId || !address || !category || !rawLanguage || !email || !password) {
      return res.status(400).json({
        message: 'Missing required fields (fullName, phone, studentId, address, category, language, email, password)'
      });
    }

    // --- PAYMENT VALIDATION BYPASSED ---
    // if (!paymentReceipt || !paymentMethod) { ... }

    if (!language) {
      return res.status(400).json({ message: 'Invalid language: ' + rawLanguage });
    }

    var exists = await User.findOne({
      $or: [{ email: email }, { studentId: studentId }]
    });

    if (exists) {
      var conflictField = exists.email === email ? 'email' : 'studentId';
      return res.status(400).json({
        message: 'Email or Student ID already exists',
        conflictField: conflictField
      });
    }

    var hashed = await bcrypt.hash(password, 10);

    // ✅ Create student as APPROVED and ACTIVE immediately for testing
    var student = await User.create({
      fullName: fullName,
      phone: phone,
      studentId: studentId,
      address: address,
      category: category,
      language: language,
      email: email,
      password: hashed,
      role: 'student',
      schoolId: req.user._id,
      isActive: true,        // Set to true for testing
      status: 'approved',    // Set to approved for testing
      paymentReceipt: paymentReceipt,
      paymentMethod: paymentMethod,
      paymentAmount: 0       // Set price to 0
    });

    console.log('STUDENT CREATED (AUTO-APPROVED):', student.email);

    res.status(201).json({
      message: 'Student added successfully (Free Testing Mode)',
      student: {
        id: student._id,
        fullName: student.fullName,
        category: student.category,
        language: student.language,
        email: student.email,
        status: 'approved'
      }
    });
  } catch (err) {
    console.log('=== ADD STUDENT ERROR ===', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET ALL STUDENTS
router.get('/students', auth, authorize('school'), async function(req, res) {
  try {
    var students = await User.find({
      role: 'student',
      schoolId: req.user._id
    }).select('-password').sort({ createdAt: -1 });

    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET ONE STUDENT + EXAMS
router.get('/student/:id', auth, authorize('school'), async function(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    var student = await User.findOne({
      _id: req.params.id,
      role: 'student',
      schoolId: req.user._id
    }).select('-password');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    var exams = await Exam.find({
      studentId: req.params.id,
      schoolId: req.user._id
    }).sort({ createdAt: -1 });

    res.json({ student: student, exams: exams });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ EDIT STUDENT
router.put('/student/:id', auth, authorize('school'), async function(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    var update = {};
    if (req.body.fullName) update.fullName = req.body.fullName;
    if (req.body.phone) update.phone = req.body.phone;
    if (req.body.address) update.address = req.body.address;
    if (req.body.category) update.category = req.body.category;

    if (req.body.language) {
      var languageMap = {
        en: 'English', ar: 'Arabic', fr: 'French',
        english: 'English', arabic: 'Arabic', french: 'French',
        English: 'English', Arabic: 'Arabic', French: 'French'
      };
      update.language = languageMap[req.body.language];
    }

    var student = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'student', schoolId: req.user._id },
      update,
      { new: true, runValidators: true }
    ).select('-password');

    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ DELETE STUDENT
router.delete('/student/:id', auth, authorize('school'), async function(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    var student = await User.findOne({
      _id: req.params.id,
      role: 'student',
      schoolId: req.user._id
    });

    if (!student) return res.status(404).json({ message: 'Student not found' });

    await Exam.deleteMany({ studentId: req.params.id });
    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'Student deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
