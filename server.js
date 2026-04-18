const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');

const app = express();

// =========================
// CORS - FINAL FIX
// =========================
const allowedOrigins = [
  'https://driving-school-frontend-k6u2maqqj-hadighanem57-7353s-projects.vercel.app',
  'https://driving-school-frontend-iota.vercel.app',
  'https://driving-school-smoky.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/^https:\/\/driving-school-frontend.*\.vercel\.app$/.test(origin)) return true;
  return false;
}

app.use(function (req, res, next) {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    }

    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  } else if (origin) {
    console.log('CORS BLOCKED ORIGIN:', origin);
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// =========================
// BODY PARSERS
// =========================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =========================
// STATIC FILES
// =========================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =========================
// LOGGER
// =========================
app.use(function (req, res, next) {
  console.log('----------------------------');
  console.log('REQUEST:', req.method, req.path);
  console.log('ORIGIN:', req.headers.origin || 'NO ORIGIN');
  console.log('Authorization header:', req.header('Authorization') || 'MISSING');
  next();
});

// =========================
// ROUTES
// =========================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/superadmin', require('./routes/superadmin'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/school', require('./routes/school'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/exam', require('./routes/exam'));
app.use('/api/report', require('./routes/report'));
app.use('/api/video', require('./routes/video'));

// =========================
// ERROR HANDLER
// =========================
app.use(function (err, req, res, next) {
  console.error('SERVER ERROR:', err);
  res.status(500).json({
    message: err.message || 'Internal Server Error'
  });
});

// =========================
// SEED SUPER ADMIN
// =========================
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

// =========================
// START SERVER
// =========================
mongoose.connect(process.env.MONGODB_URI)
  .then(async function () {
    console.log('MongoDB Connected');
    await seedAdmin();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, function () {
      console.log('Server running on port ' + PORT);
    });
  })
  .catch(function (err) {
    console.log('MongoDB Error:', err);
  });