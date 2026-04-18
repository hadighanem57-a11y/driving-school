const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');

const app = express();

// Middleware
app.use(cors({
  origin: [
    "https://driving-school-frontend-iota.vercel.app",
    "https://driving-school-smoky.vercel.app",
    "http://localhost:3000"
  ],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Logger لكل request
app.use(function(req, res, next) {
  console.log('----------------------------');
  console.log('REQUEST:', req.method, req.path);
  console.log('Authorization header:', req.header('Authorization') || 'MISSING');
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/superadmin', require('./routes/superadmin'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/school', require('./routes/school'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/exam', require('./routes/exam'));
app.use('/api/report', require('./routes/report'));
app.use('/api/video', require('./routes/video'));

// Error handler عام
app.use(function(err, req, res, next) {
  console.error('SERVER ERROR:', err);
  res.status(500).json({
    message: err.message || 'Internal Server Error'
  });
});

// Seed super admin
async function seedAdmin() {
  try {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      console.log('ADMIN_EMAIL or ADMIN_PASSWORD missing in .env');
      return;
    }

    const exists = await User.findOne({ role: 'superadmin' });

    if (!exists) {
      const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);

      await User.create({
        fullName: 'Super Admin',
        email: process.env.ADMIN_EMAIL,
        password: hashed,
        role: 'superadmin',
        isActive: true
      });

      console.log('Super Admin created: ' + process.env.ADMIN_EMAIL);
    } else {
      console.log('Super Admin already exists');
    }
  } catch (e) {
    console.log('Seed error:', e.message);
  }
}

// Connect MongoDB ثم شغّل السيرفر
mongoose.connect(process.env.MONGODB_URI)
  .then(async function() {
    console.log('MongoDB Connected');
    await seedAdmin();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, function() {
      console.log('Server running on port ' + PORT);
    });
  })
  .catch(function(err) {
    console.log('MongoDB Error:', err);
  });