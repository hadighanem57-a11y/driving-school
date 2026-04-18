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

    var totalStudents = await User.countDocuments({ role: 'student', schoolId: schoolId });
    var totalExams = await Exam.countDocuments({ schoolId: schoolId });
    var passedExams = await Exam.countDocuments({ schoolId: schoolId, passed: true });

    var categories = ['A', 'A1', 'B', 'B1', 'C', 'C1', 'CE', 'D', 'D1', 'Z', 'Z1'];
    var categoryStats = [];

    for (var i = 0; i < categories.length; i++) {
      var count = await User.countDocuments({
        role: 'student',
        schoolId: schoolId,
        category: categories[i]
      });
      if (count > 0) {
        categoryStats.push({ category: categories[i], count: count });
      }
    }

    res.json({
      totalStudents: totalStudents,
      totalExams: totalExams,
      passedExams: passedExams,
      categoryStats: categoryStats
    });
  } catch (err) {
    console.log('SCHOOL STATS ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ ADD STUDENT - WITH FULL DEBUG LOGGING
router.post('/add-student', auth, authorize('school'), async function(req, res) {
  try {
    console.log('=== ADD STUDENT START ===');
    console.log('BODY:', JSON.stringify(req.body));
    console.log('USER ID:', req.user._id);
    console.log('USER ROLE:', req.user.role);

    var fullName = req.body.fullName;
    var phone = req.body.phone;
    var studentId = req.body.studentId;
    var address = req.body.address;
    var category = req.body.category;
    var rawLanguage = req.body.language;
    var email = req.body.email;
    var password = req.body.password;

    // Language mapping - accept both codes and full names
    var languageMap = {
      en: 'English',
      ar: 'Arabic',
      fr: 'French',
      english: 'English',
      arabic: 'Arabic',
      french: 'French',
      English: 'English',
      Arabic: 'Arabic',
      French: 'French'
    };

    var language = languageMap[rawLanguage];

    if (!fullName || !phone || !studentId || !address || !category || !rawLanguage || !email || !password) {
      console.log('MISSING FIELDS:', {
        fullName: !!fullName,
        phone: !!phone,
        studentId: !!studentId,
        address: !!address,
        category: !!category,
        language: !!rawLanguage,
        email: !!email,
        password: !!password
      });
      return res.status(400).json({
        message: 'ALL fields required: fullName, phone, studentId, address, category, language, email, password',
        received: {
          fullName: !!fullName,
          phone: !!phone,
          studentId: !!studentId,
          address: !!address,
          category: !!category,
          language: rawLanguage,
          email: !!email,
          password: password ? 'provided' : 'missing'
        }
      });
    }

    if (!language) {
      console.log('INVALID LANGUAGE:', rawLanguage);
      return res.status(400).json({
        message: 'Invalid language: ' + rawLanguage + '. Allowed: English, Arabic, French, en, ar, fr'
      });
    }

    // Check duplicate
    var exists = await User.findOne({
      $or: [{ email: email }, { studentId: studentId }]
    });

    if (exists) {
      var conflictField = exists.email === email ? 'email' : 'studentId';
      console.log('DUPLICATE FOUND:', conflictField, '=', conflictField === 'email' ? email : studentId);
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
      isActive: true
    });

    console.log('STUDENT CREATED OK:', student._id, student.fullName);

    res.status(201).json({
      message: 'Student added',
      student: {
        id: student._id,
        fullName: student.fullName,
        category: student.category,
        language: student.language
      }
    });

  } catch (err) {
    console.log('=== ADD STUDENT ERROR ===');
    console.log('ERROR NAME:', err.name);
    console.log('ERROR MSG:', err.message);
    if (err.errors) {
      console.log('VALIDATION ERRORS:', JSON.stringify(err.errors));
    }
    if (err.code === 11000) {
      console.log('DUPLICATE KEY:', JSON.stringify(err.keyValue));
      return res.status(400).json({
        message: 'Duplicate entry: ' + JSON.stringify(err.keyValue)
      });
    }
    res.status(500).json({
      message: err.message,
      errorName: err.name,
      details: err.errors ? Object.keys(err.errors).map(function(k) {
        return k + ': ' + err.errors[k].message;
      }) : null
    });
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

// ✅ EDIT STUDENT - WITH LANGUAGE MAPPING
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
        en: 'English',
        ar: 'Arabic',
        fr: 'French',
        english: 'English',
        arabic: 'Arabic',
        french: 'French',
        English: 'English',
        Arabic: 'Arabic',
        French: 'French'
      };

      var mappedLanguage = languageMap[req.body.language];
      if (!mappedLanguage) {
        return res.status(400).json({ message: 'Invalid language value: ' + req.body.language });
      }
      update.language = mappedLanguage;
    }

    console.log('EDIT STUDENT:', req.params.id, 'UPDATE:', JSON.stringify(update));

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

// ✅ DELETE STUDENT - SECURED
router.delete('/student/:id', auth, authorize('school'), async function(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    // Make sure student belongs to this school
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