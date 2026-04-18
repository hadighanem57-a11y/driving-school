const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Exam = require('../models/Exam');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

// Student report - last 3 exams
router.get('/student-pdf/:studentId', auth, async function(req, res) {
  try {
    var student = await User.findById(req.params.studentId).select('-password');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    var school = await User.findById(student.schoolId).select('schoolName');
    var exams = await Exam.find({
      studentId: req.params.studentId,
      completedAt: { $exists: true, $ne: null }
    }).sort({ createdAt: -1 }).limit(3);

    if (exams.length === 0) {
      return res.status(400).json({ message: 'No completed exams' });
    }

    var doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report-' + student.fullName + '.pdf');
    doc.pipe(res);

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text('DRIVING SCHOOL EXAM REPORT', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(16).text(school ? school.schoolName : 'School', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').text('Date: ' + new Date().toLocaleDateString(), { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);

    // Student info
    doc.fontSize(12).font('Helvetica-Bold').text('Student Information');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text('Name: ' + student.fullName);
    doc.text('Student ID: ' + student.studentId);
    doc.text('Category: ' + student.category);
    doc.text('Phone: ' + student.phone);
    doc.text('Address: ' + student.address);
    doc.text('Language: ' + student.language);
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);

    // Each exam
    for (var e = 0; e < exams.length; e++) {
      var exam = exams[e];
      if (doc.y > 650) doc.addPage();

      doc.fontSize(13).font('Helvetica-Bold')
        .text('Exam ' + (e + 1) + ' - ' + exam.type.toUpperCase());
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica');
      doc.text('Date: ' + new Date(exam.createdAt).toLocaleDateString() + ' ' + new Date(exam.createdAt).toLocaleTimeString());
      doc.text('Category: ' + exam.category + ' | Language: ' + exam.language);
      doc.text('Score: ' + exam.score + '% (' + exam.correctAnswers + '/' + exam.totalQuestions + ')');
      doc.text('Result: ' + (exam.passed ? 'PASSED' : 'FAILED'));
      doc.text('Time: ' + Math.floor(exam.timeTaken / 60) + 'm ' + (exam.timeTaken % 60) + 's');
      doc.text('Distribution: Law=' + exam.lawCount + ' Safety=' + exam.safetyCount + ' Sign=' + exam.signCount);
      doc.moveDown(0.3);

      // Wrong answers
      var wrongOnes = [];
      for (var q = 0; q < exam.questions.length; q++) {
        if (!exam.questions[q].isCorrect) {
          wrongOnes.push(exam.questions[q]);
        }
      }

      if (wrongOnes.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('red').text('Wrong Answers:');
        doc.fillColor('black');
        doc.moveDown(0.2);

        for (var w = 0; w < wrongOnes.length; w++) {
          if (doc.y > 700) doc.addPage();

          var wq = wrongOnes[w];
          doc.fontSize(9).font('Helvetica');
          doc.text((w + 1) + '. [' + wq.questionCategory + '] ' + wq.questionText);
          doc.text('   Your: ' + (wq.studentAnswer || 'No answer') + ' | Correct: ' + wq.correctAnswer);

          // Sign image
          if (wq.imagePath && wq.questionCategory === 'Sign') {
            var imgPath = path.join(__dirname, '..', wq.imagePath);
            if (fs.existsSync(imgPath)) {
              try {
                doc.image(imgPath, doc.x, doc.y, { width: 45, height: 45 });
                doc.moveDown(3);
              } catch (imgErr) {
                // skip
              }
            }
          }
          doc.moveDown(0.2);
        }
      } else {
        doc.fontSize(10).font('Helvetica').fillColor('green').text('All answers correct!');
        doc.fillColor('black');
      }

      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);
    }

    doc.fontSize(8).text('Generated: ' + new Date().toLocaleString(), 40, 770, { align: 'center' });
    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin full report PDF
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

      // Monthly data
      doc.fontSize(9).font('Helvetica');
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var monthLine = '';
      for (var m = 0; m < 12; m++) {
        var mStart = new Date(new Date().getFullYear(), m, 1);
        var mEnd = new Date(new Date().getFullYear(), m + 1, 1);
        var mStudents = await User.countDocuments({
          role: 'student', schoolId: school._id,
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

// Single exam PDF
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
    if (exam.schoolId) doc.fontSize(14).text(exam.schoolId.schoolName, { align: 'center' });
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