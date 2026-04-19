const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Exam = require('../models/Exam');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

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

function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(String(text || ''));
}

// منقلب ترتيب الكلمات فقط، مش الحروف
function rtlText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .reverse()
    .join(' ');
}

function prepareArabicValue(value) {
  if (value === null || value === undefined) return '';
  var txt = String(value);
  return hasArabic(txt) ? rtlText(txt) : txt;
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

function drawArabicField(doc, y, label, value, options) {
  options = options || {};

  var labelX = options.labelX || 335;
  var labelW = options.labelW || 210;
  var colonX = options.colonX || 323;
  var colonW = options.colonW || 8;
  var valueX = options.valueX || 55;
  var valueW = options.valueW || 255;
  var labelFont = options.labelFont || 'ArabicBold';
  var valueFont = options.valueFont || 'Arabic';
  var labelSize = options.labelSize || 11;
  var valueSize = options.valueSize || 11;
  var color = options.color || '#000';

  var rawValue = value === null || value === undefined ? '' : String(value);
  var shownValue = prepareArabicValue(rawValue);

  var valueAlign = options.valueAlign;
  if (!valueAlign) {
    valueAlign = hasArabic(rawValue) ? 'right' : 'left';
  }

  doc.fillColor(color);

  doc.font(labelFont).fontSize(labelSize).text(
    rtlText(label),
    labelX,
    y,
    {
      width: labelW,
      align: 'right'
    }
  );

  doc.font(labelFont).fontSize(labelSize).text(
    ':',
    colonX,
    y,
    {
      width: colonW,
      align: 'center'
    }
  );

  doc.font(valueFont).fontSize(valueSize).text(
    shownValue,
    valueX,
    y,
    {
      width: valueW,
      align: valueAlign
    }
  );
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
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');
    doc.pipe(res);

    var fonts = setupFonts(doc);
    var fontR = fonts.regular;
    var fontB = fonts.bold;

    console.log('Using fonts:', fontR, fontB, 'Arabic:', fonts.hasArabic);

    // HEADER
    doc.fontSize(22).font(fontB).fillColor('#111');

    if (fonts.hasArabic) {
      doc.text(rtlText('تقرير نتائج الامتحان'), { align: 'center' });
    } else {
      doc.text('EXAM RESULTS REPORT', { align: 'center' });
    }

    doc.moveDown(0.4);

    if (school) {
      doc.fontSize(16).font(fontB).fillColor('#111').text(
        prepareArabicValue(school.schoolName || ''),
        { align: 'center' }
      );
      doc.moveDown(0.4);

      if (fonts.hasArabic) {
        var schoolY = doc.y;

        drawArabicField(doc, schoolY, 'رقم الرخصة', school.licenseNumber || '', {
          labelFont: fontB,
          valueFont: fontR,
          valueAlign: 'left'
        });
        schoolY += 17;

        drawArabicField(doc, schoolY, 'الهاتف', school.phone || '', {
          labelFont: fontB,
          valueFont: fontR,
          valueAlign: 'left'
        });
        schoolY += 17;

        drawArabicField(doc, schoolY, 'العنوان', school.address || '', {
          labelFont: fontB,
          valueFont: fontR
        });
        schoolY += 20;

        doc.y = schoolY;
      } else {
        doc.fontSize(11).font(fontR);
        doc.text('License: ' + (school.licenseNumber || ''), { align: 'center' });
        doc.text('Phone: ' + (school.phone || '') + '  |  ' + (school.address || ''), { align: 'center' });
      }
    }

    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(2).stroke('#333');
    doc.moveDown(0.6);

    // STUDENT INFO
    doc.fontSize(14).font(fontB).fillColor('#111');

    if (fonts.hasArabic) {
      doc.text(rtlText('معلومات الطالب'), { align: 'right' });
      doc.moveDown(0.3);

      var infoY = doc.y;

      drawArabicField(doc, infoY, 'الاسم الكامل', student.fullName || '', {
        labelFont: fontB,
        valueFont: fontR
      });
      infoY += 18;

      drawArabicField(doc, infoY, 'رقم الطالب', student.studentId || '', {
        labelFont: fontB,
        valueFont: fontR,
        valueAlign: 'left'
      });
      infoY += 18;

      drawArabicField(doc, infoY, 'الفئة', student.category || '', {
        labelFont: fontB,
        valueFont: fontR,
        valueAlign: 'left'
      });
      infoY += 18;

      drawArabicField(doc, infoY, 'الهاتف', student.phone || '', {
        labelFont: fontB,
        valueFont: fontR,
        valueAlign: 'left'
      });
      infoY += 18;

      drawArabicField(doc, infoY, 'العنوان', student.address || '', {
        labelFont: fontB,
        valueFont: fontR
      });
      infoY += 18;

      drawArabicField(doc, infoY, 'البريد الإلكتروني', student.email || '', {
        labelFont: fontB,
        valueFont: fontR,
        valueAlign: 'left'
      });
      infoY += 20;

      doc.y = infoY;
    } else {
      doc.text('Student Information');
      doc.moveDown(0.3);
      doc.fontSize(11).font(fontR);
      doc.text('Full Name: ' + (student.fullName || ''));
      doc.text('Student ID: ' + (student.studentId || ''));
      doc.text('Category: ' + (student.category || ''));
      doc.text('Phone: ' + (student.phone || ''));
      doc.text('Address: ' + (student.address || ''));
      doc.text('Email: ' + (student.email || ''));
    }

    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).stroke('#bbb');
    doc.moveDown(0.6);

    // EXAMS TITLE
    doc.fontSize(14).font(fontB).fillColor('#111');

    if (fonts.hasArabic) {
      doc.text(rtlText('نتائج الامتحانات'), { align: 'right' });
      doc.moveDown(0.2);

      var countY = doc.y;
      drawArabicField(doc, countY, 'عدد الامتحانات', exams.length, {
        labelFont: fontB,
        valueFont: fontR,
        valueAlign: 'left'
      });
      doc.y = countY + 22;
    } else {
      doc.text('Last ' + exams.length + ' Exam Results');
      doc.moveDown(0.3);
    }

    doc.moveDown(0.2);

    // EXAMS
    for (var e = 0; e < exams.length; e++) {
      var exam = exams[e];
      var cardHeight = fonts.hasArabic ? 160 : 130;

      if (doc.y > (760 - cardHeight)) doc.addPage();

      var cardY = doc.y;
      var bgColor = exam.passed ? '#e8f5e9' : '#ffebee';
      var borderClr = exam.passed ? '#4caf50' : '#f44336';

      doc.save();
      doc.roundedRect(40, cardY, 515, cardHeight, 8).fill(bgColor);
      doc.roundedRect(40, cardY, 515, cardHeight, 8).lineWidth(2).stroke(borderClr);
      doc.restore();

      if (fonts.hasArabic) {
        var rowY = cardY + 10;

        drawArabicField(doc, rowY, 'الامتحان', e + 1, {
          labelFont: fontB,
          valueFont: fontR,
          valueAlign: 'left',
          color: '#333'
        });
        rowY += 15;

        drawArabicField(doc, rowY, 'التاريخ', formatDateAr(exam.createdAt), {
          labelFont: fontR,
          valueFont: fontR,
          color: '#555'
        });
        rowY += 15;

        drawArabicField(doc, rowY, 'الوقت', formatTimeAr(exam.createdAt), {
          labelFont: fontR,
          valueFont: fontR,
          color: '#555'
        });
        rowY += 15;

        drawArabicField(doc, rowY, 'النوع', exam.type === 'exam' ? 'امتحان رسمي' : 'اختبار تجريبي', {
          labelFont: fontR,
          valueFont: fontR,
          color: '#555'
        });
        rowY += 15;

        drawArabicField(doc, rowY, 'الفئة', exam.category || '', {
          labelFont: fontR,
          valueFont: fontR,
          valueAlign: 'left',
          color: '#555'
        });

        doc.fontSize(30).font(fontB).fillColor(exam.passed ? '#2e7d32' : '#c62828');
        doc.text(
          exam.correctAnswers + ' / ' + exam.totalQuestions,
          55,
          cardY + 82,
          { width: 490, align: 'center' }
        );

        doc.fontSize(16).font(fontB).fillColor(exam.passed ? '#2e7d32' : '#c62828');
        doc.text(
          exam.passed ? 'ناجح' : 'راسب',
          55,
          cardY + 116,
          { width: 490, align: 'center' }
        );

        var mins = Math.floor((exam.timeTaken || 0) / 60);
        var secs = (exam.timeTaken || 0) % 60;

        doc.fontSize(9).font(fontR).fillColor('#888');
        doc.text(
          String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0'),
          55,
          cardY + 138,
          { width: 490, align: 'center' }
        );
      } else {
        doc.fillColor('#333');
        doc.fontSize(13).font(fontB).text('Exam #' + (e + 1), 55, cardY + 10);

        doc.fontSize(10).font(fontR).fillColor('#555');
        doc.text(
          'Date: ' + formatDateAr(exam.createdAt) + '   |   Time: ' + formatTimeAr(exam.createdAt),
          55,
          cardY + 28
        );

        var typeEn = exam.type === 'exam' ? 'Official Exam' : 'Practice Test';
        doc.text(
          'Category: ' + exam.category + '   |   Type: ' + typeEn,
          55,
          cardY + 43
        );

        doc.fontSize(32).font(fontB);
        doc.fillColor(exam.passed ? '#2e7d32' : '#c62828');
        doc.text(
          exam.correctAnswers + ' / ' + exam.totalQuestions,
          55,
          cardY + 60,
          { width: 490, align: 'center' }
        );

        doc.fontSize(18).font(fontB);
        doc.text(
          exam.passed ? 'PASSED' : 'FAILED',
          55,
          cardY + 95,
          { width: 490, align: 'center' }
        );

        var minsEn = Math.floor((exam.timeTaken || 0) / 60);
        var secsEn = (exam.timeTaken || 0) % 60;
        doc.fontSize(9).font(fontR).fillColor('#888');
        doc.text(
          'Duration: ' + minsEn + 'm ' + secsEn + 's',
          55,
          cardY + 115,
          { width: 490, align: 'center' }
        );
      }

      doc.fillColor('#000');
      doc.y = cardY + cardHeight + 12;
    }

    // FOOTER
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).stroke('#ccc');
    doc.moveDown(0.3);

    doc.fontSize(8).font(fontR).fillColor('#aaa');
    doc.text(
      'Generated: ' + new Date().toLocaleString(),
      40,
      doc.y,
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
