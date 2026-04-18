const express = require('express');
const router = express.Router();
const Question = require('../models/Question');
const Exam = require('../models/Exam');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

/*
  CATEGORY MAPPING (Lebanese System):
  ─────────────────────────────────────
  A   → Moto questions      (A = A1)
  A1  → Moto questions      (A = A1)
  B   → Car questions       (independent)
  B1  → Public questions    (independent)
  C   → Truck questions     (C = C1 = CE)
  C1  → Truck questions     (C = C1 = CE)
  CE  → Truck questions     (C = C1 = CE)
  D   → Bus questions       (D = D1)
  D1  → Bus questions       (D = D1)
  Z   → Car questions       (fallback)
  Z1  → Car questions       (fallback)

  RULES:
  - Sign questions: shared across ALL categories
  - If no Safety found → use Law
  - If no Law found → use Safety
*/

const CATEGORY_MAP = {
  'A':  { dbCategories: ['Moto'],   name: 'A - Moto' },
  'A1': { dbCategories: ['Moto'],   name: 'A1 - Moto Light' },
  'B':  { dbCategories: ['Car'],    name: 'B - Car' },
  'B1': { dbCategories: ['Public'], name: 'B1 - Public/Taxi' },
  'C':  { dbCategories: ['Truck'],  name: 'C - Truck' },
  'C1': { dbCategories: ['Truck'],  name: 'C1 - Truck Medium' },
  'CE': { dbCategories: ['Truck'],  name: 'CE - Truck + Trailer' },
  'D':  { dbCategories: ['Bus'],    name: 'D - Bus' },
  'D1': { dbCategories: ['Bus'],    name: 'D1 - Mini Bus' },
  'Z':  { dbCategories: ['Car'],    name: 'Z - Special' },
  'Z1': { dbCategories: ['Car'],    name: 'Z1 - Special Light' }
};

async function getQuestions(qCategory, dbCategories, count, excludeIds) {
  if (count <= 0) return [];
  excludeIds = excludeIds || [];

  // First try: specific category
  let qs = await Question.aggregate([
    {
      $match: {
        questionCategory: qCategory,
        isActive: true,
        category: { $in: dbCategories },
        _id: { $nin: excludeIds }
      }
    },
    { $sample: { size: count } }
  ]);

  // If not enough, try with Car as fallback
  if (qs.length < count && !dbCategories.includes('Car')) {
    const usedIds = qs.map(q => q._id);
    const allExclude = excludeIds.concat(usedIds);
    const extra = await Question.aggregate([
      {
        $match: {
          questionCategory: qCategory,
          isActive: true,
          category: 'Car',
          _id: { $nin: allExclude }
        }
      },
      { $sample: { size: count - qs.length } }
    ]);
    qs = qs.concat(extra);
  }

  // Still not enough, get from anywhere
  if (qs.length < count) {
    const usedIds = qs.map(q => q._id);
    const allExclude = excludeIds.concat(usedIds);
    const extra = await Question.aggregate([
      {
        $match: {
          questionCategory: qCategory,
          isActive: true,
          _id: { $nin: allExclude }
        }
      },
      { $sample: { size: count - qs.length } }
    ]);
    qs = qs.concat(extra);
  }

  return qs;
}

// GENERATE EXAM
router.post('/generate', auth, async function (req, res) {
  try {
    const studentId = req.body.studentId || req.user._id;
    const type = req.body.type;
    const category = req.body.category;
    const language = req.body.language;
    const lawCount = parseInt(req.body.lawCount) || 10;
    const safetyCount = parseInt(req.body.safetyCount) || 10;
    const signCount = parseInt(req.body.signCount) || 10;

    if (!type || !category || !language) {
      return res.status(400).json({ message: 'type, category, language required' });
    }

    if (lawCount + safetyCount + signCount !== 30) {
      return res.status(400).json({ message: 'Total must be exactly 30' });
    }

    // Get school ID
    let schoolId;
    if (req.user.role === 'school') {
      schoolId = req.user._id;
    } else if (req.user.role === 'student') {
      schoolId = req.user.schoolId;
    } else {
      const stu = await User.findById(studentId);
      schoolId = stu ? stu.schoolId : null;
    }

    const config = CATEGORY_MAP[category] || CATEGORY_MAP['B'];
    const dbCats = config.dbCategories;

    console.log('=== GENERATE EXAM ===');
    console.log('Student category:', category, '→ DB categories:', dbCats);
    console.log('Distribution: Law=' + lawCount + ', Safety=' + safetyCount + ', Sign=' + signCount);

    // Get Law questions
    let lawQs = await getQuestions('Law', dbCats, lawCount, []);

    // Get Safety questions
    const usedIds = lawQs.map(q => q._id);
    let safetyQs = await getQuestions('Safety', dbCats, safetyCount, usedIds);

    // If safety not enough, fill with extra Law
    if (safetyQs.length < safetyCount) {
      const needed = safetyCount - safetyQs.length;
      const allUsed = usedIds.concat(safetyQs.map(q => q._id));
      const extra = await getQuestions('Law', dbCats, needed, allUsed);
      safetyQs = safetyQs.concat(extra);
    }

    // If law not enough, fill with extra Safety
    if (lawQs.length < lawCount) {
      const needed = lawCount - lawQs.length;
      const allUsed = lawQs.map(q => q._id).concat(safetyQs.map(q => q._id));
      const extra = await getQuestions('Safety', dbCats, needed, allUsed);
      lawQs = lawQs.concat(extra);
    }

    // Get Sign questions (signs are shared across all categories)
    const allUsedIds = lawQs.concat(safetyQs).map(q => q._id);
    const signQs = await Question.aggregate([
      {
        $match: {
          questionCategory: 'Sign',
          isActive: true,
          _id: { $nin: allUsedIds }
        }
      },
      { $sample: { size: signCount } }
    ]);

    // Combine all
    let allQs = lawQs.concat(safetyQs).concat(signQs);

    // Fill if still not 30
    if (allQs.length < 30) {
      const ids = allQs.map(q => q._id);
      const fill = await Question.aggregate([
        { $match: { isActive: true, _id: { $nin: ids } } },
        { $sample: { size: 30 - allQs.length } }
      ]);
      allQs = allQs.concat(fill);
    }

    if (allQs.length === 0) {
      return res.status(400).json({ message: 'No questions found! Import questions first.' });
    }

    // Shuffle
    allQs.sort(() => Math.random() - 0.5);
    allQs = allQs.slice(0, 30);

    console.log('Final exam: Law=' + lawQs.length + ', Safety=' + safetyQs.length + ', Sign=' + signQs.length);

    // Format questions
    const examQs = allQs.map((q) => ({
      questionId: q._id,
      setNumber: q.setNumber,
      questionText: (q.questionText && q.questionText[language]) || (q.questionText && q.questionText.English) || '',
      answerA: (q.answerA && q.answerA[language]) || (q.answerA && q.answerA.English) || '',
      answerB: (q.answerB && q.answerB[language]) || (q.answerB && q.answerB.English) || '',
      answerC: (q.answerC && q.answerC[language]) || (q.answerC && q.answerC.English) || '',
      correctAnswer: q.correctAnswer,
      studentAnswer: '',
      isCorrect: false,
      questionCategory: q.questionCategory,
      imagePath: q.imagePath || ''
    }));

    const exam = await Exam.create({
      studentId: studentId,
      schoolId: schoolId,
      type: type,
      category: category,
      language: language,
      questions: examQs,
      totalQuestions: examQs.length,
      lawCount: lawCount,
      safetyCount: safetyCount,
      signCount: signCount,
      startedAt: new Date()
    });

    res.json({
      examId: exam._id,
      questions: examQs,
      timeLimit: 900,
      totalQuestions: examQs.length,
      type: type,
      category: category,
      categoryName: config.name
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ message: err.message });
  }
});

// SUBMIT EXAM
router.post('/submit/:examId', auth, async function (req, res) {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.completedAt) return res.status(400).json({ message: 'Already submitted' });

    const answers = req.body.answers || [];
    const timeTaken = req.body.timeTaken || 0;

    let correct = 0;
    let wrong = 0;

    for (let i = 0; i < exam.questions.length; i++) {
      const ans = (Array.isArray(answers) ? answers[i] : answers[i]) || '';
      const isCorrect = ans && ans.toUpperCase() === exam.questions[i].correctAnswer.toUpperCase();
      exam.questions[i].studentAnswer = ans;
      exam.questions[i].isCorrect = isCorrect;
      if (isCorrect) correct++;
      else wrong++;
    }

    exam.correctAnswers = correct;
    exam.wrongAnswers = wrong;
    exam.score = Math.round((correct / exam.totalQuestions) * 100);
    exam.passed = exam.score >= 70;
    exam.timeTaken = timeTaken;
    exam.completedAt = new Date();
    await exam.save();

    res.json({
      examId: exam._id,
      score: exam.score,
      passed: exam.passed,
      correctAnswers: correct,
      wrongAnswers: wrong,
      totalQuestions: exam.totalQuestions,
      timeTaken: timeTaken
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET RESULT
router.get('/result/:examId', auth, async function (req, res) {
  try {
    const exam = await Exam.findById(req.params.examId)
      .populate('studentId', 'fullName email category studentId phone')
      .populate('schoolId', 'schoolName');
    if (!exam) return res.status(404).json({ message: 'Not found' });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// HISTORY
router.get('/history/:studentId', auth, async function (req, res) {
  try {
    const exams = await Exam.find({ studentId: req.params.studentId })
      .populate('schoolId', 'schoolName')
      .sort({ createdAt: -1 });
    res.json(exams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/my-history', auth, async function (req, res) {
  try {
    const exams = await Exam.find({ studentId: req.user._id })
      .populate('schoolId', 'schoolName')
      .sort({ createdAt: -1 });
    res.json(exams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CATEGORY NAMES
router.get('/category-names', auth, function (req, res) {
  const names = {};
  Object.keys(CATEGORY_MAP).forEach(k => {
    names[k] = CATEGORY_MAP[k].name;
  });
  res.json(names);
});

module.exports = router;