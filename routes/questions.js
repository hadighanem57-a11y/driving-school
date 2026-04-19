const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const Question = require('../models/Question');
const { auth, authorize } = require('../middleware/auth');

const upload = multer({ dest: 'uploads/temp/' });
const imageUpload = multer({ dest: 'uploads/temp/' });

function cleanupTemp(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.log('Temp cleanup error:', e.message);
  }
}

async function uploadToImgBB(file) {
  if (!process.env.IMGBB_API_KEY) {
    throw new Error('IMGBB_API_KEY missing in environment variables');
  }

  var base64Image = fs.readFileSync(file.path, { encoding: 'base64' });

  var form = new URLSearchParams();
  form.append('key', process.env.IMGBB_API_KEY);
  form.append('name', path.parse(file.originalname).name);
  form.append('image', base64Image);

  var response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form
  });

  var data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      (data && data.error && data.error.message) || 'ImgBB upload failed'
    );
  }

  return data.data.display_url || data.data.url;
}

function clean(val) {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

function normalizeCategory(val) {
  var raw = clean(val).toLowerCase();
  if (raw === 'car') return 'Car';
  if (raw === 'moto' || raw === 'motorcycle') return 'Moto';
  if (raw === 'public') return 'Public';
  if (raw === 'bus') return 'Bus';
  if (raw === 'truck') return 'Truck';
  return clean(val) || 'Car';
}

function normalizeQuestionCategory(val) {
  var raw = clean(val).toLowerCase();
  if (raw === 'law' || raw === 'laws') return 'Law';
  if (raw === 'safety' || raw === 'safeties') return 'Safety';
  if (raw === 'sign' || raw === 'signs') return 'Sign';
  return 'Law';
}

function normalizeDifficulty(val) {
  var raw = clean(val).toLowerCase();
  if (raw === 'easy') return 'Easy';
  if (raw === 'hard') return 'Hard';
  return 'Medium';
}

function normalizeBool(val) {
  var raw = clean(val).toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

// ============================================
// ✅ SPECIFIC ROUTES FIRST
// ============================================

// ✅ IMPORT CSV
router.post('/import', auth, authorize('admin', 'superadmin'), upload.single('file'), async function(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    var content = fs.readFileSync(req.file.path, 'utf8');
    var records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true
    });

    console.log('=== CSV IMPORT START === Rows:', records.length);

    var imported = 0;
    var updated = 0;
    var lawCount = 0;
    var safetyCount = 0;
    var signCount = 0;
    var imageCount = 0;
    var errors = [];

    for (var i = 0; i < records.length; i++) {
      try {
        var row = records[i];
        var setNumber = parseInt(clean(row.SetNumber || row.Id || 0), 10);
        if (!setNumber || isNaN(setNumber)) continue;

        var questionCategory = normalizeQuestionCategory(row.QuestionCategory);
        var imagePath = clean(row.ImagePath);

        if (questionCategory === 'Law') lawCount++;
        if (questionCategory === 'Safety') safetyCount++;
        if (questionCategory === 'Sign') signCount++;
        if (imagePath) imageCount++;

        var questionData = {
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

        var existing = await Question.findOne({ setNumber: setNumber });

        if (existing) {
          await Question.findByIdAndUpdate(existing._id, questionData);
          updated++;
        } else {
          await Question.create(questionData);
          imported++;
        }
      } catch (err) {
        errors.push({ row: i + 2, error: err.message });
      }
    }

    cleanupTemp(req.file.path);

    console.log('Imported:', imported, 'Updated:', updated);

    return res.json({
      message: 'Imported: ' + imported + ', Updated: ' + updated + ', Errors: ' + errors.length,
      imported: imported,
      updated: updated,
      breakdown: { law: lawCount, safety: safetyCount, sign: signCount },
      imageCount: imageCount,
      errors: errors.slice(0, 20)
    });
  } catch (err) {
    console.error('IMPORT ERROR:', err);
    return res.status(500).json({ message: err.message });
  }
});

// ✅ EXPORT
router.get('/export', auth, authorize('admin', 'superadmin'), async function(req, res) {
  try {
    var questions = await Question.find().sort({ setNumber: 1 });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ STATS
router.get('/stats', auth, authorize('admin', 'superadmin'), async function(req, res) {
  try {
    var stats = await Question.aggregate([
      {
        $group: {
          _id: { category: '$category', questionCategory: '$questionCategory' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.category': 1 } }
    ]);

    var total = await Question.countDocuments();
    var active = await Question.countDocuments({ isActive: true });

    res.json({ stats: stats, total: total, active: active });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ DELETE ALL QUESTIONS
router.delete('/delete-all', auth, authorize('superadmin'), async function(req, res) {
  try {
    var result = await Question.deleteMany({});
    console.log('DELETED ALL QUESTIONS:', result.deletedCount);
    res.json({ message: 'Deleted ' + result.deletedCount + ' questions' });
  } catch (err) {
    console.log('DELETE ALL ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ UPLOAD ONE IMAGE
router.post('/upload-image', auth, authorize('admin', 'superadmin'), imageUpload.single('image'), async function(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    console.log('UPLOADING IMAGE TO IMGBB:', req.file.originalname);

    var imagePath = await uploadToImgBB(req.file);

    console.log('IMGBB URL:', imagePath);

    if (req.body.questionId) {
      await Question.findByIdAndUpdate(req.body.questionId, { imagePath: imagePath });
      console.log('UPDATED QUESTION:', req.body.questionId, 'WITH IMAGE:', imagePath);
    }

    cleanupTemp(req.file.path);

    res.json({ imagePath: imagePath });
  } catch (err) {
    cleanupTemp(req.file && req.file.path);
    console.log('UPLOAD IMAGE ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ UPLOAD MANY IMAGES - SIMPLE
router.post('/upload-images', auth, authorize('admin', 'superadmin'), imageUpload.array('images', 500), async function(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images uploaded' });
    }

    console.log('UPLOADING', req.files.length, 'IMAGES TO IMGBB');

    var files = [];

    for (var i = 0; i < req.files.length; i++) {
      var file = req.files[i];

      try {
        var imageUrl = await uploadToImgBB(file);

        files.push({
          name: file.originalname,
          path: imageUrl
        });

        console.log('UPLOADED:', file.originalname, '->', imageUrl);
      } catch (uploadErr) {
        console.log('FAILED TO UPLOAD:', file.originalname, uploadErr.message);
        files.push({
          name: file.originalname,
          path: '',
          error: uploadErr.message
        });
      }

      cleanupTemp(file.path);
    }

    res.json({
      message: files.length + ' images processed',
      files: files
    });
  } catch (err) {
    if (req.files && req.files.length) {
      req.files.forEach(function(file) {
        cleanupTemp(file.path);
      });
    }
    console.log('UPLOAD MANY IMAGES ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ AUTO-MATCH BY FILENAME = SET NUMBER
router.post('/upload-images-auto', auth, authorize('admin', 'superadmin'), imageUpload.array('images', 500), async function(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images uploaded' });
    }

    console.log('=== AUTO UPLOAD START ===', req.files.length, 'files');

    var matched = 0;
    var notFound = 0;
    var failed = 0;
    var results = [];

    for (var i = 0; i < req.files.length; i++) {
      var file = req.files[i];

      try {
        var nameOnly = path.parse(file.originalname).name;
        var setNumber = parseInt(nameOnly, 10);

        if (!setNumber || isNaN(setNumber)) {
          console.log('SKIP (no number):', file.originalname);
          results.push({ name: file.originalname, status: 'skipped', reason: 'filename is not a number' });
          cleanupTemp(file.path);
          failed++;
          continue;
        }

        var question = await Question.findOne({ setNumber: setNumber });

        if (!question) {
          console.log('SKIP (no question):', setNumber);
          results.push({ name: file.originalname, status: 'not_found', reason: 'no question with setNumber ' + setNumber });
          cleanupTemp(file.path);
          notFound++;
          continue;
        }

        var imageUrl = await uploadToImgBB(file);

        await Question.findByIdAndUpdate(question._id, { imagePath: imageUrl });

        console.log('MATCHED:', file.originalname, '-> Q#' + setNumber, '->', imageUrl);
        results.push({ name: file.originalname, status: 'matched', setNumber: setNumber, url: imageUrl });
        matched++;

      } catch (uploadErr) {
        console.log('ERROR:', file.originalname, uploadErr.message);
        results.push({ name: file.originalname, status: 'error', reason: uploadErr.message });
        failed++;
      }

      cleanupTemp(file.path);
    }

    console.log('=== AUTO UPLOAD DONE === Matched:', matched, 'NotFound:', notFound, 'Failed:', failed);

    res.json({
      message: matched + ' images matched, ' + notFound + ' questions not found, ' + failed + ' failed',
      matched: matched,
      notFound: notFound,
      failed: failed,
      results: results
    });

  } catch (err) {
    if (req.files && req.files.length) {
      req.files.forEach(function(file) {
        cleanupTemp(file.path);
      });
    }
    console.log('AUTO UPLOAD ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ UPLOAD IMAGES + MATCH USING CSV IMAGEPATH
router.post('/upload-images-csv-match', auth, authorize('admin', 'superadmin'), imageUpload.fields([
  { name: 'csv', maxCount: 1 },
  { name: 'images', maxCount: 500 }
]), async function(req, res) {
  try {
    if (!req.files || !req.files.csv || !req.files.csv[0]) {
      return res.status(400).json({ message: 'CSV file required' });
    }

    if (!req.files.images || req.files.images.length === 0) {
      return res.status(400).json({ message: 'No images uploaded' });
    }

    var csvFile = req.files.csv[0];
    var images = req.files.images;

    var csvContent = fs.readFileSync(csvFile.path, 'utf8');
    var records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true
    });

    console.log('=== CSV MATCH START === rows:', records.length, 'images:', images.length);

    // Build mapping from image filename -> setNumber
    // Example:
    // SetNumber = 1234
    // ImagePath = C:\Program Files\DrivingSchool\signs\1.jpg
    // So:
    // 1 -> 1234
    var imageMap = {};

    for (var i = 0; i < records.length; i++) {
      var row = records[i];

      var setNumber = parseInt(clean(row.SetNumber || row.Id || 0), 10);
      var imagePath = clean(row.ImagePath);

      if (!setNumber || !imagePath) continue;

      var normalizedPath = imagePath.replace(/\\/g, '/');
      var fileName = normalizedPath.split('/').pop(); // 1.jpg
      var baseName = fileName ? fileName.split('.')[0] : ''; // 1

      if (baseName) {
        imageMap[baseName] = setNumber;
      }
    }

    console.log('CSV IMAGE MAP COUNT:', Object.keys(imageMap).length);

    var matched = 0;
    var notFound = 0;
    var failed = 0;
    var results = [];

    for (var j = 0; j < images.length; j++) {
      var file = images[j];

      try {
        var uploadedBaseName = path.parse(file.originalname).name; // 1 from 1.jpg
        var mappedSetNumber = imageMap[uploadedBaseName];

        if (!mappedSetNumber) {
          console.log('NO CSV MAPPING FOR:', file.originalname);
          results.push({
            name: file.originalname,
            status: 'no_mapping',
            reason: 'No CSV mapping found for filename ' + uploadedBaseName
          });
          cleanupTemp(file.path);
          notFound++;
          continue;
        }

        var question = await Question.findOne({ setNumber: mappedSetNumber });

        if (!question) {
          console.log('QUESTION NOT FOUND FOR SET NUMBER:', mappedSetNumber);
          results.push({
            name: file.originalname,
            status: 'not_found',
            setNumber: mappedSetNumber,
            reason: 'No question with setNumber ' + mappedSetNumber
          });
          cleanupTemp(file.path);
          notFound++;
          continue;
        }

        var imageUrl = await uploadToImgBB(file);

        await Question.findByIdAndUpdate(question._id, { imagePath: imageUrl });

        console.log('CSV MATCHED:', file.originalname, '-> setNumber', mappedSetNumber, '->', imageUrl);

        results.push({
          name: file.originalname,
          status: 'matched',
          setNumber: mappedSetNumber,
          url: imageUrl
        });
        matched++;
      } catch (uploadErr) {
        console.log('CSV MATCH ERROR:', file.originalname, uploadErr.message);
        results.push({
          name: file.originalname,
          status: 'error',
          reason: uploadErr.message
        });
        failed++;
      }

      cleanupTemp(file.path);
    }

    cleanupTemp(csvFile.path);

    console.log('=== CSV MATCH DONE === matched:', matched, 'notFound:', notFound, 'failed:', failed);

    res.json({
      message: matched + ' images matched, ' + notFound + ' not found, ' + failed + ' failed',
      matched: matched,
      notFound: notFound,
      failed: failed,
      results: results
    });
  } catch (err) {
    if (req.files) {
      if (req.files.csv) {
        req.files.csv.forEach(function(file) {
          cleanupTemp(file.path);
        });
      }
      if (req.files.images) {
        req.files.images.forEach(function(file) {
          cleanupTemp(file.path);
        });
      }
    }

    console.log('CSV MATCH ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET ALL WITH FILTERS
router.get('/', auth, async function(req, res) {
  try {
    var filter = {};

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

    var page = parseInt(req.query.page || '1', 10);
    var limit = parseInt(req.query.limit || '50', 10);

    var total = await Question.countDocuments(filter);

    var questions = await Question.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ setNumber: 1 });

    res.json({
      questions: questions,
      total: total,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ ADD SINGLE
router.post('/', auth, authorize('admin', 'superadmin'), async function(req, res) {
  try {
    var question = await Question.create(req.body);
    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================
// ✅ DYNAMIC ROUTES LAST
// ============================================

// ✅ EDIT
router.put('/:id', auth, authorize('admin', 'superadmin'), async function(req, res) {
  try {
    var question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(question);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ DELETE ONE
router.delete('/:id', auth, authorize('admin', 'superadmin'), async function(req, res) {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
