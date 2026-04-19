const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Exam = require('../models/Exam');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

// ============================================
// ARABIC TEXT FIX - بيعكس الكلمات صح
// ============================================
function fixArabic(text) {
  if (!text) return '';
  text = String(text);

  // اقسم النص لكلمات
  var words = text.split(' ');
  var result = [];

  for (var i = 0; i < words.length; i++) {
    var word = words[i];
    // اعكس كل كلمة عربية
    var reversed = word.split('').reverse().join('');
    result.push(reversed);
  }

  // اعكس ترتيب الكلمات كلها
  result.reverse();
  return result.join(' ');
}

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
  var period = h >= 12 ? 'م' : 'ص';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + period;
}

function setupFonts(doc) {
  var regularPath = path.join(__dirname, '..', 'fonts', 'Amiri-Regular.ttf');
  var boldPath = path.join(__dirname, '..', 'fonts', 'Amiri-Bold.ttf');

  var hasRegular = fs.existsSync(regularPath);
  var hasBold = fs.existsSync(boldPath);

  console.log('Font check - Regular:', hasRegular, 'Bold:', hasBold);

  if (hasRegular) {
    doc.registerFont('Arabic', regularPath);
  }
  if (hasBold) {
    doc.registerFont('ArabicBold', boldPath);
  }

  return {
    regular: hasRegular ? 'Arabic' : 'Helvetica',
    bold: hasBold ? 'ArabicBold' : 'Helvetica-Bold',
    hasArabic: hasRegular && hasBold
  };
}

// ============================================
// STUDENT PDF
// ============================================
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
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');
    doc.pipe(res);

    var fonts = setupFonts(doc);
    var fontR = fonts.regular;
    var fontB = fonts.bold;
    var ar = fonts.hasArabic;

    // ============================================
    // HEADER
    // ============================================
    doc.fontSize(22).font(fontB);
    doc.text(
      ar ? fixArabic('تقرير نتائج الامتحان') : 'EXAM RESULTS REPORT',
      { align: 'center' }
    );
    doc.moveDown(0.5);

    if (school) {
      doc.fontSize(16).font(fontB).text(
        ar ? fixArabic(school.schoolName || '') : (school.schoolName || ''),
        { align: 'center' }
      );
      doc.moveDown(0.2);
      doc.fontSize(10).font(fontR);

      if (ar) {
        doc.text(
          fixArabic('رقم الرخصة') + ': ' + (school.licenseNumber || ''),
          { align: 'center' }
        );
        doc.text(
          fixArabic('هاتف') + ': ' + (school.phone || '') +
          '  —  ' + fixArabic(school.address || ''),
          { align: 'center' }
        );
      } else {
        doc.text('License: ' + (school.licenseNumber || ''), { align: 'center' });
        doc.text('Phone: ' + (school.phone || '') + '  |  ' + (school.address || ''), { align: 'center' });
      }
    }

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(2).stroke('#333');
    doc.moveDown(0.6);

    // ============================================
    // STUDENT INFO
    // ============================================
    doc.fontSize(14).font(fontB);
    doc.text(
      ar ? fixArabic('معلومات الطالب') : 'Student Information',
      { align: ar ? 'right' : 'left' }
    );
    doc.moveDown(0.4);

    doc.fontSize(11).font(fontR);

    if (ar) {
      // بنكتب label عربي معكوس + القيمة بالانجليزي
      var infoLines = [
        { label: 'الاسم الكامل', value: student.fullName || '' },
        { label: 'رقم الطالب', value: student.studentId || '' },
        { label: 'الفئة', value: student.category || '' },
        { label: 'الهاتف', value: student.phone || '' },
        { label: 'العنوان', value: fixArabic(student.address || '') },
        { label: 'البريد الإلكتروني', value: student.email || '' }
      ];

      for (var ii = 0; ii < infoLines.length; ii++) {
        var line = infoLines[ii];
        // القيمة + : + اللابل المعكوس
        doc.text(
          line.value + '  :' + fixArabic(line.label),
          { align: 'right' }
        );
      }
    } else {
      doc.text('Full Name: ' + (student.fullName || ''));
      doc.text('Student ID: ' + (student.studentId || ''));
      doc.text('Category: ' + (student.category || ''));
      doc.text('Phone: ' + (student.phone || ''));
      doc.text('Address: ' + (student.address || ''));
      doc.text('Email: ' + (student.email || ''));
    }

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).stroke('#bbb');
    doc.moveDown(0.6);

    // ============================================
    // EXAMS TITLE
    // ============================================
    doc.fontSize(14).font(fontB);
    doc.text(
      ar
        ? fixArabic('نتائج الامتحانات') + ' — ' + fixArabic('آخر') + ' ' + exams.length
        : 'Last ' + exams.length + ' Exam Results',
      { align: ar ? 'right' : 'left' }
    );
    doc.moveDown(0.5);

    // ============================================
    // EXAM CARDS
    // ============================================
    for (var e = 0; e < exams.length; e++) {
      var exam = exams[e];

      if (doc.y > 600) doc.addPage();

      var cardY = doc.y;
      var bgColor = exam.passed ? '#e8f5e9' : '#ffebee';
      var borderClr = exam.passed ? '#4caf50' : '#f44336';

      doc.save();
      doc.roundedRect(40, cardY, 515, 135, 8).fill(bgColor);
      doc.roundedRect(40, cardY, 515, 135, 8).lineWidth(2).stroke(borderClr);
      doc.restore();

      doc.fillColor('#333');

      // Exam number
      doc.fontSize(13).font(fontB);
      doc.text(
        ar ? fixArabic('الامتحان') + ' ' + (e + 1) : 'Exam #' + (e + 1),
        55, cardY + 10,
        { width: 490, align: ar ? 'right' : 'left' }
      );

      // Date & Time
      doc.fontSize(10).font(fontR).fillColor('#555');
      if (ar) {
        doc.text(
          formatTimeAr(exam.createdAt) + '  —  ' + fixArabic('الوقت') + ':' +
          '      ' +
          fixArabic(formatDateAr(exam.createdAt)) + '  :' + fixArabic('التاريخ'),
          55, cardY + 30,
          { width: 490, align: 'right' }
        );
      } else {
        doc.text(
          'Date: ' + formatDateAr(exam.createdAt) + '   |   Time: ' + formatTimeAr(exam.createdAt),
          55, cardY + 30,
          { width: 490, align: 'left' }
        );
      }

      // Category & Type
      var typeAr = exam.type === 'exam' ? fixArabic('امتحان رسمي') : fixArabic('اختبار تجريبي');
      var typeEn = exam.type === 'exam' ? 'Official Exam' : 'Practice Test';

      doc.fontSize(10).font(fontR).fillColor('#555');
      if (ar) {
        doc.text(
          typeAr + '  —  ' + fixArabic('النوع') + ':' +
          '      ' +
          exam.category + '  :' + fixArabic('الفئة'),
          55, cardY + 45,
          { width: 490, align: 'right' }
        );
      } else {
        doc.text(
          'Category: ' + exam.category + '   |   Type: ' + typeEn,
          55, cardY + 45,
          { width: 490, align: 'left' }
        );
      }

      // Score BIG
      doc.fontSize(30).font(fontB);
      doc.fillColor(exam.passed ? '#2e7d32' : '#c62828');
      doc.text(
        exam.correctAnswers + ' / ' + exam.totalQuestions,
        55, cardY + 62,
        { width: 490, align: 'center' }
      );

      // Result
      doc.fontSize(16).font(fontB);
      if (ar) {
        doc.text(
          exam.passed ? fixArabic('ناجح') + ' ✓' : fixArabic('راسب') + ' ✗',
          55, cardY + 97,
          { width: 490, align: 'center' }
        );
      } else {
        doc.text(
          exam.passed ? '✓ PASSED' : '✗ FAILED',
          55, cardY + 97,
          { width: 490, align: 'center' }
        );
      }

      // Duration
      var mins = Math.floor((exam.timeTaken || 0) / 60);
      var secs = (exam.timeTaken || 0) % 60;
      doc.fontSize(9).font(fontR).fillColor('#888');
      if (ar) {
        doc.text(
          fixArabic('ثانية') + ' ' + secs + ' ' + fixArabic('دقيقة و') + ' ' + mins + '  :' + fixArabic('المدة'),
          55, cardY + 118,
          { width: 490, align: 'center' }
        );
      } else {
        doc.text(
          'Duration: ' + mins + 'm ' + secs + 's',
          55, cardY + 118,
          { width: 490, align: 'center' }
        );
      }

      doc.fillColor('#000');
      doc.y = cardY + 150;
    }

    // ============================================
    // FOOTER
    // ============================================
    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).stroke('#ccc');
    doc.moveDown(0.3);
    doc.fontSize(8).font(fontR).fillColor('#aaa');
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

// ============================================
// ADMIN FULL PDF - ما تغير شي
// ============================================
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

// ============================================
// EXAM PDF - ما تغير شي
// ============================================
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
