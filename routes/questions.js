const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const Question = require('../models/Question');
const { auth, authorize } = require('../middleware/auth');

const upload = multer({ dest: 'uploads/temp/' });

const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/signs/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const imageUpload = multer({ storage: imageStorage });

function clean(val) {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

function normalizeCategory(val) {
  const raw = clean(val).toLowerCase();

  if (raw === 'car') return 'Car';
  if (raw === 'moto' || raw === 'motorcycle') return 'Moto';
  if (raw === 'public') return 'Public';
  if (raw === 'bus') return 'Bus';
  if (raw === 'truck') return 'Truck';

  return clean(val) || 'Car';
}

function normalizeQuestionCategory(val) {
  const raw = clean(val).toLowerCase();

  if (raw === 'law' || raw === 'laws') return 'Law';
  if (raw === 'safety' || raw === 'safeties') return 'Safety';
  if (raw === 'sign' || raw === 'signs') return 'Sign';

  return 'Law';
}

function normalizeDifficulty(val) {
  const raw = clean(val).toLowerCase();
  if (raw === 'easy') return 'Easy';
  if (raw === 'hard') return 'Hard';
  return 'Medium';
}

function normalizeBool(val) {
  const raw = clean(val).toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

// IMPORT CSV
router.post('/import', auth, authorize('admin', 'superadmin'),upload.single('file'), async function (req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf8');

    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true
    });

    console.log('=== CSV IMPORT START ===');
    console.log('Rows found:', records.length);

    let imported = 0;
    let updated = 0;
    let errors = [];

    let lawCount = 0;
    let safetyCount = 0;
    let signCount = 0;
    let imageCount = 0;

    for (let i = 0; i < records.length; i++) {
      try {
        const row = records[i];

        const setNumber = parseInt(clean(row.SetNumber || row.Id || 0), 10);
        if (!setNumber || isNaN(setNumber)) continue;

        const questionCategory = normalizeQuestionCategory(row.QuestionCategory);
        const imagePath = clean(row.ImagePath);

        if (questionCategory === 'Law') lawCount++;
        if (questionCategory === 'Safety') safetyCount++;
        if (questionCategory === 'Sign') signCount++;
        if (imagePath) imageCount++;

        const questionData = {
          setNumber: setNumber,
          questionText: {
            English: clean(row.QuestionTextEnglish),
            Arabic: clean(row.QuestionTextArabic),
            French: clean(row.QuestionTextFrench)
          },
          answerA: {
            English: clean(row.AnswerAEnglish),
            Arabic: clean(row.AnswerAArabic),
            French: clean(row.AnswerAFrench)
          },
          answerB: {
            English: clean(row.AnswerBEnglish),
            Arabic: clean(row.AnswerBArabic),
            French: clean(row.AnswerBFrench)
          },
          answerC: {
            English: clean(row.AnswerCEnglish),
            Arabic: clean(row.AnswerCArabic),
            French: clean(row.AnswerCFrench)
          },
          correctAnswer: clean(row.CorrectAnswer || 'A').toUpperCase(),
          category: normalizeCategory(row.Category),
          questionCategory: questionCategory,
          difficultyLevel: normalizeDifficulty(row.DifficultyLevel),
          isActive: normalizeBool(row.IsActive || 'TRUE'),
          imagePath: imagePath
        };

        const existing = await Question.findOne({ setNumber: setNumber });

        if (existing) {
          await Question.findByIdAndUpdate(existing._id, questionData);
          updated++;
        } else {
          await Question.create(questionData);
          imported++;
        }
      } catch (err) {
        errors.push({
          row: i + 2,
          error: err.message
        });
      }
    }

    try {
      fs.unlinkSync(filePath);
    } catch (e) {}

    console.log('Imported:', imported);
    console.log('Updated:', updated);
    console.log('Law:', lawCount);
    console.log('Safety:', safetyCount);
    console.log('Sign:', signCount);
    console.log('With imagePath:', imageCount);
    console.log('Errors:', errors.length);
    console.log('=== CSV IMPORT END ===');

    return res.json({
      message: `Imported: ${imported}, Updated: ${updated}, Errors: ${errors.length}`,
      imported,
      updated,
      breakdown: {
        law: lawCount,
        safety: safetyCount,
        sign: signCount
      },
      imageCount,
      errors: errors.slice(0, 20)
    });
  } catch (err) {
    console.error('IMPORT ERROR:', err);
    return res.status(500).json({ message: err.message });
  }
});

// EXPORT
router.get('/export', auth, authorize('admin', 'superadmin'), async function (req, res) {
  try {
    const questions = await Question.find().sort({ setNumber: 1 });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// STATS
router.get('/stats', auth, authorize('admin', 'superadmin'), async function (req, res) {
  try {
    const stats = await Question.aggregate([
      {
        $group: {
          _id: { category: '$category', questionCategory: '$questionCategory' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.category': 1 } }
    ]);

    const total = await Question.countDocuments();
    const active = await Question.countDocuments({ isActive: true });

    res.json({ stats, total, active });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET ALL WITH FILTERS
router.get('/', auth, async function (req, res) {
  try {
    const filter = {};

    if (req.query.category) filter.category = req.query.category;
    if (req.query.questionCategory) filter.questionCategory = req.query.questionCategory;
    if (req.query.isActive !== undefined && req.query.isActive !== '') {
      filter.isActive = req.query.isActive === 'true';
    }

    if (req.query.search) {
      filter.$or = [
        { 'questionText.English': { $regex: req.query.search, $options: 'i' } },
        { 'questionText.Arabic': { $regex: req.query.search, $options: 'i' } },
        { 'questionText.French': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '50', 10);

    const total = await Question.countDocuments(filter);
    const questions = await Question.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ setNumber: 1 });

    res.json({
      questions,
      total,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ADD SINGLE
router.post('/', auth, authorize('admin', 'superadmin'), async function (req, res) {
  try {
    const question = await Question.create(req.body);
    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// EDIT
router.put('/:id', auth, authorize('admin', 'superadmin'), async function (req, res) {
  try {
    const question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(question);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE
router.delete('/:id', auth, authorize('admin', 'superadmin'), async function (req, res) {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPLOAD ONE IMAGE
router.post('/upload-image', auth, authorize('admin', 'superadmin'), imageUpload.single('image'), async function (req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image uploaded' });

    const imagePath = '/uploads/signs/' + req.file.filename;

    if (req.body.questionId) {
      await Question.findByIdAndUpdate(req.body.questionId, { imagePath });
    }

    res.json({ imagePath });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPLOAD MANY IMAGES
router.post('/upload-images', auth, authorize('admin', 'superadmin'), imageUpload.array('images', 500), async function (req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images uploaded' });
    }

    const files = req.files.map(f => ({
      name: f.originalname,
      path: '/uploads/signs/' + f.filename
    }));

    res.json({
      message: `${files.length} images uploaded`,
      files
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;