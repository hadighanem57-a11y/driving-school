require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../models/Question');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    const before = await Question.distinct('questionCategory');
    console.log('Before categories:', before);

    const questions = await Question.find({});
    let modified = 0;

    for (const q of questions) {
      const raw = String(q.questionCategory || '').trim().toLowerCase();

      let fixed = q.questionCategory;

      if (raw === 'sign' || raw === 'signs') fixed = 'Sign';
      else if (raw === 'law' || raw === 'laws') fixed = 'Law';
      else if (raw === 'safety' || raw === 'safeties') fixed = 'Safety';

      if (fixed !== q.questionCategory) {
        q.questionCategory = fixed;
        await q.save();
        modified++;
      }
    }

    const law = await Question.countDocuments({ questionCategory: 'Law' });
    const safety = await Question.countDocuments({ questionCategory: 'Safety' });
    const sign = await Question.countDocuments({ questionCategory: 'Sign' });
    const after = await Question.distinct('questionCategory');

    console.log('Modified:', modified);
    console.log('After categories:', after);
    console.log('Law:', law);
    console.log('Safety:', safety);
    console.log('Sign:', sign);

    process.exit();
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

main();