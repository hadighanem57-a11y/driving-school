require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Question = require('../models/Question');

const SOURCE_DIR = process.env.SIGNS_SOURCE_DIR || 'C:\\Program Files\\DrivingSchool\\signs';
const DEST_DIR = path.join(__dirname, '..', 'uploads', 'signs');

function getFilenameFromQuestion(q) {
  const raw = String(q.imagePath || '').trim();

  if (!raw) {
    return `${q.setNumber}.jpg`;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return null;
  }

  const base = path.basename(raw);
  if (base) return base;

  return `${q.setNumber}.jpg`;
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    if (!fs.existsSync(DEST_DIR)) {
      fs.mkdirSync(DEST_DIR, { recursive: true });
    }

    const signQuestions = await Question.find({ questionCategory: 'Sign' }).sort({ setNumber: 1 });

    console.log('Total sign questions:', signQuestions.length);
    console.log('Source dir:', SOURCE_DIR);
    console.log('Dest dir:', DEST_DIR);

    let linked = 0;
    let remote = 0;
    let missing = 0;
    let failed = 0;

    for (const q of signQuestions) {
      try {
        const raw = String(q.imagePath || '').trim();

        if (raw.startsWith('http://') || raw.startsWith('https://')) {
          remote++;
          console.log(`REMOTE kept -> ${q.setNumber} -> ${raw}`);
          continue;
        }

        let filename = getFilenameFromQuestion(q);
        if (!filename) {
          remote++;
          continue;
        }

        let sourcePath = path.join(SOURCE_DIR, filename);

        if (!fs.existsSync(sourcePath)) {
          const fallback = `${q.setNumber}.jpg`;
          const fallbackPath = path.join(SOURCE_DIR, fallback);
          if (fs.existsSync(fallbackPath)) {
            filename = fallback;
            sourcePath = fallbackPath;
          }
        }

        if (!fs.existsSync(sourcePath)) {
          missing++;
          console.log(`MISSING -> setNumber ${q.setNumber} -> expected ${filename}`);
          continue;
        }

        const destPath = path.join(DEST_DIR, filename);

        await sharp(sourcePath)
          .resize(113, 113, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .jpeg({ quality: 92 })
          .toFile(destPath);

        q.imagePath = `/uploads/signs/${filename}`;
        await q.save();

        linked++;
        console.log(`LINKED -> setNumber ${q.setNumber} -> ${q.imagePath}`);
      } catch (err) {
        failed++;
        console.log(`FAILED -> setNumber ${q.setNumber} -> ${err.message}`);
      }
    }

    console.log('\n===== DONE =====');
    console.log('Linked local:', linked);
    console.log('Remote kept:', remote);
    console.log('Missing:', missing);
    console.log('Failed:', failed);

    process.exit();
  } catch (err) {
    console.error('SCRIPT ERROR:', err);
    process.exit(1);
  }
}

main();