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

    var totalStudents = await User.countDocuments({ role: 'student', schoolId: schoolId, status: 'approved' });
    var pendingStudents = await User.countDocuments({ role: 'student', schoolId: schoolId, status: 'pending' });
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

// ✅ ADD STUDENT - WITH PAYMENT
router.post('/add-student', auth, authorize('school'), async function(req, res) {
  try {
    console.log('=== ADD STUDENT START ===');
    console.log('BODY:', JSON.stringify(req.body));

    var fullName = req.body.fullName;
    var phone = req.body.phone;
    var studentId = req.body.studentId;
    var address = req.body.address;
    var category = req.body.category;
    var rawLanguage = req.body.language;
    var email = req.body.email;
    var password = req.body.password;
    var paymentReceipt = req.body.paymentReceipt;
    var paymentMethod = req.body.paymentMethod;

    var languageMap = {
      en: 'English', ar: 'Arabic', fr: 'French',
      english: 'English', arabic: 'Arabic', french: 'French',
      English: 'English', Arabic: 'Arabic', French: 'French'
    };

    var language = languageMap[rawLanguage];

    if (!fullName || !phone || !studentId || !address || !category || !rawLanguage || !email || !password) {
      return res.status(400).json({
        message: 'ALL fields required: fullName, phone, studentId, address, category, language, email, password'
      });
    }

    if (!paymentReceipt || !paymentMethod) {
      return res.status(400).json({
        message: 'Payment receipt number and payment method are required'
      });
    }

    if (!language) {
      return res.status(400).json({
        message: 'Invalid language: ' + rawLanguage
      });
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
      isActive: false,
      status: 'pending',
      paymentReceipt: paymentReceipt,
      paymentMethod: paymentMethod,
      paymentAmount: 5
    });

    console.log('STUDENT CREATED (PENDING):', student._id, student.fullName);

    res.status(201).json({
      message: 'Student added - waiting for admin approval',
      student: {
        id: student._id,
        fullName: student.fullName,
        category: student.category,
        language: student.language,
        status: 'pending'
      }
    });

  } catch (err) {
    console.log('=== ADD STUDENT ERROR ===');
    console.log('ERROR:', err.message);
    if (err.code === 11000) {
      return res.status(400).json({
        message: 'Duplicate entry: ' + JSON.stringify(err.keyValue)
      });
    }
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET ALL STUDENTS (approved + pending)
router.get('/students', auth, authorize('school'), async function(req, res) {
  try {
    var students = await User.find({
      role: 'student',
      schoolId: req.user._id
    }).select('-password').sort({ createdAt: -1 });

    res.json(students);
  } catch (err) {
    console.log('GET STUDENTS ERROR:', err.message);
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
    console.log('GET STUDENT ERROR:', err.message);
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
      var mappedLanguage = languageMap[req.body.language];
      if (!mappedLanguage) {
        return res.status(400).json({ message: 'Invalid language value: ' + req.body.language });
      }
      update.language = mappedLanguage;
    }

    var student = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'student', schoolId: req.user._id },
      update,
      { new: true, runValidators: true }
    ).select('-password');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json(student);
  } catch (err) {
    console.log('EDIT STUDENT ERROR:', err.message);
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

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    await Exam.deleteMany({ studentId: req.params.id });
    await User.findByIdAndDelete(req.params.id);

    console.log('STUDENT DELETED:', req.params.id);

    res.json({ message: 'Student deleted' });
  } catch (err) {
    console.log('DELETE STUDENT ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
