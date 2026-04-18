require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../models/Question');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    const beforeLaw = await Question.countDocuments({ questionCategory: 'Law' });
    const beforeSafety = await Question.countDocuments({ questionCategory: 'Safety' });
    const beforeSign = await Question.countDocuments({ questionCategory: 'Sign' });

    console.log('Before:');
    console.log('Law:', beforeLaw);
    console.log('Safety:', beforeSafety);
    console.log('Sign:', beforeSign);

    // Any question that has imagePath = treat as Sign
    const questionsWithImage = await Question.find({
      imagePath: { $exists: true, $ne: '' }
    });

    console.log('Questions with imagePath:', questionsWithImage.length);

    let modified = 0;

    for (const q of questionsWithImage) {
      if (q.questionCategory !== 'Sign') {
        q.questionCategory = 'Sign';
        await q.save();
        modified++;
      }
    }

    const afterLaw = await Question.countDocuments({ questionCategory: 'Law' });
    const afterSafety = await Question.countDocuments({ questionCategory: 'Safety' });
    const afterSign = await Question.countDocuments({ questionCategory: 'Sign' });

    console.log('Modified:', modified);
    console.log('After:');
    console.log('Law:', afterLaw);
    console.log('Safety:', afterSafety);
    console.log('Sign:', afterSign);

    const sample = await Question.find({ questionCategory: 'Sign' }).limit(5);
    console.log('\nSample Sign Questions:');
    sample.forEach((q) => {
      console.log('setNumber:', q.setNumber, '| imagePath:', q.imagePath);
    });

    process.exit();
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

main();