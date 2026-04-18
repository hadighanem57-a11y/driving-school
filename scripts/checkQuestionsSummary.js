require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../models/Question');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    const total = await Question.countDocuments();
    const law = await Question.countDocuments({ questionCategory: 'Law' });
    const safety = await Question.countDocuments({ questionCategory: 'Safety' });
    const sign = await Question.countDocuments({ questionCategory: 'Sign' });
    const withImage = await Question.countDocuments({
      imagePath: { $exists: true, $ne: '' }
    });

    const byCategory = await Question.aggregate([
      {
        $group: {
          _id: { category: '$category', qcat: '$questionCategory' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.category': 1, '_id.qcat': 1 } }
    ]);

    console.log('==============================');
    console.log('TOTAL:', total);
    console.log('LAW:', law);
    console.log('SAFETY:', safety);
    console.log('SIGN:', sign);
    console.log('WITH IMAGE PATH:', withImage);
    console.log('==============================');
    console.log('BREAKDOWN:');

    byCategory.forEach((x) => {
      console.log(
        `Category=${x._id.category} | Type=${x._id.qcat} | Count=${x.count}`
      );
    });

    process.exit();
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

main();