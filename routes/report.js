const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Exam = require('../models/Exam');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

function formatDateAr(date) {
  var months = [
    'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
    'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'
  ];
  var d = new Date(date);
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function formatTimeAr(date) {
  var d = new Date(date);
  var h = d.getHours();
  var m = d.getMinutes();
  var period = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + period;
}

router.get('/student-pdf/:studentId', auth, async function(req, res) {
  try {
    var student = await User.findById(req.params.studentId).select('-password');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    var school = await User.findById(student.schoolId).select('schoolName licenseNumber phone address');

    var exams = await Exam.find({
      studentId: req.params.studentId,
      completedAt: { $exists: true, $ne: null }
    }).sort({ createdAt: -1 }).limit(3);

    if (exams.length === 0) {
      return res.status(400).json({ message: 'No completed exams' });
    }

    var doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report-' + (student.fullName || 'student') + '.pdf');
    doc.pipe(res);

    // ============================================
    // HEADER
    // ============================================
    doc.fontSize(22).font('Helvetica-Bold').text('DRIVING SCHOOL - EXAM REPORT', { align: 'center' });
    doc.moveDown(0.5);

    if (school) {
      doc.fontSize(16).font('Helvetica-Bold').text(school.schoolName || '', { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica');
      doc.text('License: ' + (school.licenseNumber || ''), { align: 'center' });
      doc.text('Phone: ' + (school.phone || '') + '  |  ' + (school.address || ''), { align: 'center' });
    }

    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(2).stroke('#333');
    doc.moveDown(0.6);

    // ============================================
    // STUDENT INFO
    // ============================================
    doc.fontSize(14).font('Helvetica-Bold').text('Student Information');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text('Full Name: ' + (student.fullName || ''));
    doc.text('Student ID: ' + (student.studentId || ''));
    doc.text('Category: ' + (student.category || ''));
    doc.text('Phone: ' + (student.phone || ''));
    doc.text('Address: ' + (student.address || ''));
    doc.text('Email: ' + (student.email || ''));

    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).stroke('#bbb');
    doc.moveDown(0.6);

    // ============================================
    // EXAMS
    // ============================================
    doc.fontSize(14).font('Helvetica-Bold').text('Last ' + exams.length + ' Exam Results');
    doc.moveDown(0.5);

    for (var e = 0; e < exams.length; e++) {
      var exam = exams[e];

      if (doc.y > 620) doc.addPage();

      var cardY = doc.y;
      var bgColor = exam.passed ? '#e8f5e9' : '#ffebee';
      var borderClr = exam.passed ? '#4caf50' : '#f44336';

      // Card
      doc.save();
      doc.roundedRect(40, cardY, 515, 120, 8).fill(bgColor);
      doc.roundedRect(40, cardY, 515, 120, 8).lineWidth(2).stroke(borderClr);
      doc.restore();

      // Exam number
      doc.fillColor('#333');
      doc.fontSize(12).font('Helvetica-Bold').text(
        'Exam #' + (e + 1),
        55, cardY + 10
      );

      // Date & Time
      doc.fontSize(9).font('Helvetica').fillColor('#555');
      doc.text(
        'Date: ' + formatDateAr(exam.createdAt) + '   |   Time: ' + formatTimeAr(exam.createdAt),
        55, cardY + 26
      );

      // Type
      var typeText = exam.type === 'exam' ? 'Official Exam' : 'Practice Test';
      doc.text(
        'Category: ' + exam.category + '   |   Type: ' + typeText,
        55, cardY + 40
      );

      // Score - BIG
      doc.fontSize(30).font('Helvetica-Bold');
      doc.fillColor(exam.passed ? '#2e7d32' : '#c62828');
      doc.text(
        exam.correctAnswers + ' / ' + exam.totalQuestions,
        55, cardY + 55,
        { width: 490, align: 'center' }
      );

      // Result
      doc.fontSize(16).font('Helvetica-Bold');
      doc.text(
        exam.passed ? 'PASSED' : 'FAILED',
        55, cardY + 88,
        { width: 490, align: 'center' }
      );

      // Time
      var mins = Math.floor((exam.timeTaken || 0) / 60);
      var secs = (exam.timeTaken || 0) % 60;
      doc.fontSize(8).font('Helvetica').fillColor('#888');
      doc.text(
        'Duration: ' + mins + 'm ' + secs + 's',
        55, cardY + 106,
        { width: 490, align: 'center' }
      );

      doc.fillColor('#000');
      doc.y = cardY + 135;
    }

    // ============================================
    // FOOTER
    // ============================================
    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).stroke('#ccc');
    doc.moveDown(0.3);

    doc.fontSize(8).font('Helvetica').fillColor('#aaa');
    doc.text(
      'Generated: ' + new Date().toLocaleString(),
      40, doc.y,
      { width: 515, align: 'center' }
    );

    doc.end();
  } catch (err) {
    console.log('STUDENT PDF ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/admin-full-pdf', auth, async function(req, res) {
  try {
    var schools = await User.find({ role: 'school' }).select('-password');
    var doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=full-report.pdf');
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('FULL SYSTEM REPORT', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').text('Generated: ' + new Date().toLocaleString(), { align: 'center' });
    doc.moveDown(1);

    for (var i = 0; i < schools.length; i++) {
      if (doc.y > 650) doc.addPage();

      var school = schools[i];
      var studentCount = await User.countDocuments({ role: 'student', schoolId: school._id });
      var examCount = await Exam.countDocuments({ schoolId: school._id });
      var passCount = await Exam.countDocuments({ schoolId: school._id, passed: true });

      doc.fontSize(13).font('Helvetica-Bold').text(school.schoolName || school.fullName);
      doc.fontSize(10).font('Helvetica');
      doc.text('License: ' + school.licenseNumber + ' | Phone: ' + school.phone);
      doc.text('Address: ' + school.address);
      doc.text('Students: ' + studentCount + ' | Exams: ' + examCount + ' | Passed: ' + passCount);
      doc.text('Status: ' + (school.isActive ? 'Active' : 'Inactive'));
      doc.moveDown(0.3);

      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var monthLine = '';

      for (var m = 0; m < 12; m++) {
        var mStart = new Date(new Date().getFullYear(), m, 1);
        var mEnd = new Date(new Date().getFullYear(), m + 1, 1);
        var mStudents = await User.countDocuments({
          role: 'student',
          schoolId: school._id,
          createdAt: { $gte: mStart, $lt: mEnd }
        });

        if (mStudents > 0) {
          monthLine += months[m] + ':' + mStudents + ' ';
        }
      }

      if (monthLine) {
        doc.fontSize(9).text('Monthly: ' + monthLine);
      }

      doc.moveTo(40, doc.y + 5).lineTo(555, doc.y + 5).stroke();
      doc.moveDown(1);
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/exam-pdf/:examId', auth, async function(req, res) {
  try {
    var exam = await Exam.findById(req.params.examId)
      .populate('studentId', 'fullName studentId category phone')
      .populate('schoolId', 'schoolName');

    if (!exam) return res.status(404).json({ message: 'Not found' });

    var doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=exam-result.pdf');
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('EXAM RESULT', { align: 'center' });
    doc.moveDown(0.3);

    if (exam.schoolId) {
      doc.fontSize(14).text(exam.schoolId.schoolName, { align: 'center' });
    }

    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');

    if (exam.studentId) {
      doc.text('Student: ' + exam.studentId.fullName);
      doc.text('ID: ' + exam.studentId.studentId);
    }

    doc.text('Category: ' + exam.category);
    doc.text('Date: ' + new Date(exam.createdAt).toLocaleString());
    doc.text('Score: ' + exam.score + '% - ' + (exam.passed ? 'PASSED' : 'FAILED'));
    doc.text('Time: ' + Math.floor(exam.timeTaken / 60) + 'm ' + (exam.timeTaken % 60) + 's');

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
