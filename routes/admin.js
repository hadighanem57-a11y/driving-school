const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const { auth, authorize } = require('../middleware/auth');

// ✅ STATS
router.get('/stats', auth, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const totalSchools = await User.countDocuments({ role: 'school' });
    const totalStudents = await User.countDocuments({ role: 'student', status: 'approved' });
    const totalQuestions = await Question.countDocuments();
    const totalExams = await Exam.countDocuments();
    const activeSchools = await User.countDocuments({ role: 'school', isActive: true });
    const pendingStudents = await User.countDocuments({ role: 'student', status: 'pending' });

    res.json({ totalSchools, totalStudents, totalQuestions, totalExams, activeSchools, pendingStudents });
  } catch (err) {
    console.log('STATS ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET PENDING COUNT (for notification badge)
router.get('/pending-count', auth, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    var count = await User.countDocuments({ role: 'student', status: 'pending' });
    res.json({ count: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET ALL PENDING STUDENTS
router.get('/pending-students', auth, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    var students = await User.find({ role: 'student', status: 'pending' })
      .select('-password')
      .populate('schoolId', 'schoolName phone email licenseNumber')
      .sort({ createdAt: -1 });

    res.json(students);
  } catch (err) {
    console.log('PENDING STUDENTS ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ APPROVE STUDENT
router.put('/approve-student/:id', auth, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    var student = await User.findOne({ _id: req.params.id, role: 'student', status: 'pending' });

    if (!student) {
      return res.status(404).json({ message: 'Pending student not found' });
    }

    student.status = 'approved';
    student.isActive = true;
    student.approvedBy = req.user._id;
    student.approvedAt = new Date();
    await student.save();

    console.log('STUDENT APPROVED:', student._id, student.fullName, 'by', req.user.email);

    res.json({ message: 'Student approved', student: { id: student._id, fullName: student.fullName, status: 'approved' } });
  } catch (err) {
    console.log('APPROVE ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ REJECT STUDENT
router.put('/reject-student/:id', auth, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    var reason = req.body.reason || 'Payment not verified';

    var student = await User.findOne({ _id: req.params.id, role: 'student', status: 'pending' });

    if (!student) {
      return res.status(404).json({ message: 'Pending student not found' });
    }

    student.status = 'rejected';
    student.isActive = false;
    student.rejectionReason = reason;
    student.approvedBy = req.user._id;
    student.approvedAt = new Date();
    await student.save();

    console.log('STUDENT REJECTED:', student._id, student.fullName, 'reason:', reason);

    res.json({ message: 'Student rejected', student: { id: student._id, fullName: student.fullName, status: 'rejected' } });
  } catch (err) {
    console.log('REJECT ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ FULL REPORT
router.get('/full-report', auth, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const schools = await User.find({ role: 'school' }).select('-password');
    const report = [];

    for (const school of schools) {
      const students = await User.countDocuments({ role: 'student', schoolId: school._id, status: 'approved' });
      const pendingCount = await User.countDocuments({ role: 'student', schoolId: school._id, status: 'pending' });
      const exams = await Exam.countDocuments({ schoolId: school._id });
      const passedExams = await Exam.countDocuments({ schoolId: school._id, passed: true });

      const monthlyData = [];
      for (let m = 0; m < 12; m++) {
        const start = new Date(new Date().getFullYear(), m, 1);
        const end = new Date(new Date().getFullYear(), m + 1, 1);
        const monthStudents = await User.countDocuments({
          role: 'student', schoolId: school._id, status: 'approved',
          createdAt: { $gte: start, $lt: end }
        });
        const monthExams = await Exam.countDocuments({
          schoolId: school._id,
          createdAt: { $gte: start, $lt: end }
        });
        monthlyData.push({ month: m + 1, students: monthStudents, exams: monthExams });
      }

      report.push({
        schoolName: school.schoolName,
        schoolId: school._id,
        email: school.email,
        phone: school.phone,
        address: school.address,
        licenseNumber: school.licenseNumber,
        totalStudents: students,
        pendingStudents: pendingCount,
        totalExams: exams,
        passedExams: passedExams,
        isActive: school.isActive,
        createdAt: school.createdAt,
        monthlyData
      });
    }

    res.json(report);
  } catch (err) {
    console.log('FULL REPORT ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET SCHOOL STUDENTS
router.get('/school-users/:schoolId', auth, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.schoolId)) {
      return res.status(400).json({ message: 'Invalid school ID' });
    }

    const students = await User.find({
      role: 'student',
      schoolId: req.params.schoolId
    }).select('-password');

    res.json(students);
  } catch (err) {
    console.log('SCHOOL USERS ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ EDIT SCHOOL
router.put('/school/:id', auth, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid school ID' });
    }

    const { schoolName, phone, address, licenseNumber } = req.body;

    const school = await User.findByIdAndUpdate(
      req.params.id,
      { schoolName, fullName: schoolName, phone, address, licenseNumber },
      { new: true }
    ).select('-password');

    if (!school) return res.status(404).json({ message: 'School not found' });

    res.json(school);
  } catch (err) {
    console.log('EDIT SCHOOL ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ CHANGE SCHOOL PASSWORD
router.put('/school-password/:id', auth, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid school ID' });
    }

    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: 'New password required' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.params.id, { password: hashed });

    res.json({ message: 'Password changed' });
  } catch (err) {
    console.log('CHANGE PASSWORD ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
