const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Exam = require('../models/Exam');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const https = require('https');

var FONT_DIR = path.join(__dirname, '..', 'fonts');
var FONT_REGULAR = path.join(FONT_DIR, 'NotoSansArabic-Regular.ttf');
var FONT_BOLD = path.join(FONT_DIR, 'NotoSansArabic-Bold.ttf');

var FONT_URL_REGULAR = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf';
var FONT_URL_BOLD = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSansArabic/NotoSansArabic-Bold.ttf';

function downloadFile(url, dest) {
  return new Promise(function(resolve, reject) {
    if (fs.existsSync(dest)) return resolve();

    if (!fs.existsSync(path.dirname(dest))) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
    }

    var file = fs.createWriteStream(dest);

    https.get(url, function(response) {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      response.pipe(file);

      file.on('finish', function() {
        file.close();
        resolve();
      });
    }).on('error', function(err) {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function ensureFonts() {
  try {
    await downloadFile(FONT_URL_REGULAR, FONT_REGULAR);
    await downloadFile(FONT_URL_BOLD, FONT_BOLD);
    return true;
  } catch (err) {
    console.log('Font download failed:', err.message);
    return false;
  }
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

    var hasFont = await ensureFonts();

    var doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report-' + (student.fullName || 'student') + '.pdf');
    doc.pipe(res);

    var fontR = 'Helvetica';
    var fontB = 'Helvetica-Bold';

    if (hasFont && fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD)) {
      doc.registerFont('Arabic', FONT_REGULAR);
      doc.registerFont('ArabicBold', FONT_BOLD);
      fontR = 'Arabic';
      fontB = 'ArabicBold';
    }

    // ============================================
    // HEADER
    // ============================================
    doc.fontSize(24).font(fontB).text('تقرير نتائج الامتحان', {
      align: 'center',
      features: ['rtla']
    });
    doc.moveDown(0.5);

    if (school) {
      doc.fontSize(18).font(fontB).text(school.schoolName || '', {
        align: 'center',
        features: ['rtla']
      });
      doc.moveDown(0.3);

      doc.fontSize(11).font(fontR);
      doc.text('رقم الرخصة: ' + (school.licenseNumber || ''), {
        align: 'center',
        features: ['rtla']
      });
      doc.text('هاتف: ' + (school.phone || '') + '  —  ' + (school.address || ''), {
        align: 'center',
        features: ['rtla']
      });
    }

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(2).stroke('#333');
    doc.moveDown(0.7);

    // ============================================
    // STUDENT INFO
    // ============================================
    doc.fontSize(15).font(fontB).text('معلومات الطالب', {
      align: 'right',
      features: ['rtla']
    });
    doc.moveDown(0.4);

    var infoLines = [
      'الاسم الكامل:  ' + (student.fullName || ''),
      'رقم الطالب:  ' + (student.studentId || ''),
      'الفئة:  ' + (student.category || ''),
      'الهاتف:  ' + (student.phone || ''),
      'العنوان:  ' + (student.address || ''),
      'البريد:  ' + (student.email || '')
    ];

    doc.fontSize(11).font(fontR);
    for (var i = 0; i < infoLines.length; i++) {
      doc.text(infoLines[i], {
        align: 'right',
        features: ['rtla']
      });
    }

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).stroke('#bbb');
    doc.moveDown(0.7);

    // ============================================
    // EXAMS
    // ============================================
    doc.fontSize(15).font(fontB).text('نتائج الامتحانات — آخر ' + exams.length, {
      align: 'right',
      features: ['rtla']
    });
    doc.moveDown(0.5);

    for (var e = 0; e < exams.length; e++) {
      var exam = exams[e];

      if (doc.y > 620) doc.addPage();

      var cardY = doc.y;
      var bgColor = exam.passed ? '#e8f5e9' : '#ffebee';
      var borderClr = exam.passed ? '#4caf50' : '#f44336';

      // Card background
      doc.save();
      doc.roundedRect(40, cardY, 515, 140, 10).fill(bgColor);
      doc.roundedRect(40, cardY, 515, 140, 10).lineWidth(2).stroke(borderClr);
      doc.restore();

      // Exam title
      doc.fillColor('#333');
      doc.fontSize(13).font(fontB).text(
        'الامتحان ' + (e + 1),
        50, cardY + 12,
        { width: 495, align: 'right', features: ['rtla'] }
      );

      // Date & Time
      doc.fontSize(10).font(fontR).fillColor('#555');
      doc.text(
        'التاريخ: ' + formatDateAr(exam.createdAt) + '    —    الوقت: ' + formatTimeAr(exam.createdAt),
        50, cardY + 32,
        { width: 495, align: 'right', features: ['rtla'] }
      );

      // Type
      var typeText = exam.type === 'exam' ? 'امتحان رسمي' : 'اختبار تجريبي';
      doc.text(
        'الفئة: ' + exam.category + '    —    النوع: ' + typeText,
        50, cardY + 48,
        { width: 495, align: 'right', features: ['rtla'] }
      );

      // Score - BIG
      doc.fontSize(32).font(fontB);
      doc.fillColor(exam.passed ? '#2e7d32' : '#c62828');
      doc.text(
        exam.correctAnswers + ' / ' + exam.totalQuestions,
        50, cardY + 68,
        { width: 495, align: 'center' }
      );

      // Result
      doc.fontSize(18).font(fontB);
      doc.text(
        exam.passed ? '✓ ناجح' : '✗ راسب',
        50, cardY + 105,
        { width: 495, align: 'center', features: ['rtla'] }
      );

      // Time taken
      var mins = Math.floor((exam.timeTaken || 0) / 60);
      var secs = (exam.timeTaken || 0) % 60;
      doc.fontSize(9).font(fontR).fillColor('#888');
      doc.text(
        'المدة: ' + mins + ' دقيقة و ' + secs + ' ثانية',
        50, cardY + 125,
        { width: 495, align: 'center', features: ['rtla'] }
      );

      doc.fillColor('#000');
      doc.y = cardY + 155;
    }

    // ============================================
    // FOOTER
    // ============================================
    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).stroke('#ccc');
    doc.moveDown(0.4);

    doc.fontSize(9).font(fontR).fillColor('#aaa');
    doc.text(
      'تم إنشاء التقرير بتاريخ: ' + formatDateAr(new Date()) + ' — ' + formatTimeAr(new Date()),
      40, doc.y,
      { width: 515, align: 'center', features: ['rtla'] }
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
    doc.moveDown(1);

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
