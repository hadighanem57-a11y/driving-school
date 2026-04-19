const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Exam = require('../models/Exam');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

// ✅ Student report - last 3 exams - ARABIC
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

    // Check if Arabic font exists
    var arabicFontPath = path.join(__dirname, '..', 'fonts', 'NotoSansArabic-Regular.ttf');
    var arabicBoldFontPath = path.join(__dirname, '..', 'fonts', 'NotoSansArabic-Bold.ttf');
    var hasArabicFont = fs.existsSync(arabicFontPath);
    var hasArabicBoldFont = fs.existsSync(arabicBoldFontPath);

    var doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report-' + student.fullName + '.pdf');
    doc.pipe(res);

    // Register Arabic fonts if available
    if (hasArabicFont) {
      doc.registerFont('Arabic', arabicFontPath);
    }
    if (hasArabicBoldFont) {
      doc.registerFont('ArabicBold', arabicBoldFontPath);
    }

    var fontRegular = hasArabicFont ? 'Arabic' : 'Helvetica';
    var fontBold = hasArabicBoldFont ? 'ArabicBold' : 'Helvetica-Bold';

    // ============================================
    // HEADER - School Info
    // ============================================
    doc.fontSize(22).font(fontBold).text('تقرير نتائج الامتحان', { align: 'center', features: ['rtla'] });
    doc.moveDown(0.5);

    if (school) {
      doc.fontSize(16).font(fontBold).text(school.schoolName || '', { align: 'center', features: ['rtla'] });
      doc.moveDown(0.3);
      doc.fontSize(11).font(fontRegular);
      doc.text('رقم الرخصة: ' + (school.licenseNumber || ''), { align: 'center', features: ['rtla'] });
      doc.text('الهاتف: ' + (school.phone || '') + '    |    العنوان: ' + (school.address || ''), { align: 'center', features: ['rtla'] });
    }

    doc.moveDown(0.5);

    // Line
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(2).stroke('#333');
    doc.moveDown(0.5);

    // ============================================
    // STUDENT INFO
    // ============================================
    doc.fontSize(14).font(fontBold).text('معلومات الطالب', { align: 'right', features: ['rtla'] });
    doc.moveDown(0.3);

    doc.fontSize(11).font(fontRegular);

    // Student info table
    var infoY = doc.y;
    var col1X = 555;
    var lineHeight = 22;

    var studentInfo = [
      { label: 'الاسم الكامل', value: student.fullName || '' },
      { label: 'رقم الطالب', value: student.studentId || '' },
      { label: 'الفئة', value: student.category || '' },
      { label: 'الهاتف', value: student.phone || '' },
      { label: 'العنوان', value: student.address || '' },
      { label: 'البريد الإلكتروني', value: student.email || '' }
    ];

    for (var s = 0; s < studentInfo.length; s++) {
      var info = studentInfo[s];
      doc.fontSize(11).font(fontBold).text(info.label + ': ', col1X - 250, infoY + (s * lineHeight), {
        width: 250,
        align: 'right',
        features: ['rtla'],
        continued: false
      });
      doc.fontSize(11).font(fontRegular).text(info.value, 40, infoY + (s * lineHeight), {
        width: 300,
        align: 'right',
        features: ['rtla']
      });
    }

    doc.y = infoY + (studentInfo.length * lineHeight) + 10;

    // Line
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).stroke('#999');
    doc.moveDown(0.5);
 
    // ============================================
    // EXAM RESULTS
    // ============================================
    doc.fontSize(14).font(fontBold).text('نتائج الامتحانات (آخر ' + exams.length + ')', { align: 'right', features: ['rtla'] });
    doc.moveDown(0.5);

    for (var e = 0; e < exams.length; e++) {
      var exam = exams[e];

      if (doc.y > 650) doc.addPage();

      // Exam card background
      var cardY = doc.y;
      var cardHeight = 130;
      var cardColor = exam.passed ? '#e8f5e9' : '#ffebee';
      var borderColor = exam.passed ? '#4caf50' : '#f44336';

      doc.save();
      doc.roundedRect(40, cardY, 515, cardHeight, 8).fill(cardColor);
      doc.roundedRect(40, cardY, 515, cardHeight, 8).lineWidth(2).stroke(borderColor);
      doc.restore();

      // Exam number
      doc.fontSize(13).font(fontBold).fillColor('#333');
      doc.text('الامتحان ' + (e + 1), 50, cardY + 12, { align: 'right', width: 495, features: ['rtla'] });

      // Date and time
      var examDate = new Date(exam.createdAt);
      var dateStr = examDate.toLocaleDateString('ar-LB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      var timeStr = examDate.toLocaleTimeString('ar-LB', {
        hour: '2-digit',
        minute: '2-digit'
      });

      doc.fontSize(10).font(fontRegular).fillColor('#555');
      doc.text('التاريخ: ' + dateStr + '    |    الوقت: ' + timeStr, 50, cardY + 30, {
        align: 'right',
        width: 495,
        features: ['rtla']
      });

      // Category and Type
      var typeAr = exam.type === 'exam' ? 'امتحان رسمي' : 'اختبار تجريبي';
      doc.text('الفئة: ' + exam.category + '    |    النوع: ' + typeAr, 50, cardY + 45, {
        align: 'right',
        width: 495,
        features: ['rtla']
      });

      // Score - BIG
      doc.fontSize(28).font(fontBold);
      doc.fillColor(exam.passed ? '#2e7d32' : '#c62828');
      doc.text(exam.correctAnswers + '/' + exam.totalQuestions, 50, cardY + 65, {
        align: 'center',
        width: 495
      });

      // Result text
      doc.fontSize(16).font(fontBold);
      doc.fillColor(exam.passed ? '#2e7d32' : '#c62828');
      doc.text(exam.passed ? '✓ ناجح' : '✗ راسب', 50, cardY + 98, {
        align: 'center',
        width: 495,
        features: ['rtla']
      });

      // Time taken
      var timeMins = Math.floor((exam.timeTaken || 0) / 60);
      var timeSecs = (exam.timeTaken || 0) % 60;
      doc.fontSize(9).font(fontRegular).fillColor('#777');
      doc.text('المدة: ' + timeMins + ' دقيقة و ' + timeSecs + ' ثانية', 50, cardY + 115, {
        align: 'center',
        width: 495,
        features: ['rtla']
      });

      doc.fillColor('#000');
      doc.y = cardY + cardHeight + 15;
    }

    // ============================================
    // FOOTER
    // ============================================
    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).stroke('#999');
    doc.moveDown(0.5);

    var now = new Date();
    var genDate = now.toLocaleDateString('ar-LB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    var genTime = now.toLocaleTimeString('ar-LB', {
      hour: '2-digit',
      minute: '2-digit'
    });

    doc.fontSize(9).font(fontRegular).fillColor('#999');
    doc.text('تم إنشاء التقرير: ' + genDate + ' - ' + genTime, 40, doc.y, {
      align: 'center',
      width: 515,
      features: ['rtla']
    });

    doc.end();
  } catch (err) {
    console.log('STUDENT PDF ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ Admin full report PDF
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

      doc.fontSize(9).font('Helvetica');
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

      if (monthLine) doc.text('Monthly students: ' + monthLine);

      doc.moveTo(40, doc.y + 5).lineTo(555, doc.y + 5).stroke();
      doc.moveDown(1);
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Single exam PDF
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
    doc.moveDown(1);

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
