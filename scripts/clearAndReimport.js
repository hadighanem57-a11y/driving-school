require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
    
    const result = await mongoose.connection.db.collection('questions').deleteMany({});
    console.log('Deleted all questions:', result.deletedCount);
    
    process.exit();
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

main();