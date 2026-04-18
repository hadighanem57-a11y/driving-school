const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');

const app = express();

const allowedOrigins = [
  'https://driving-school-frontend-k6u2maqqj-hadighanem57-7353s-projects.vercel.app',
  'https://driving-school-frontend-fgool63p9-hadighanem57-7353s-projects.vercel.app',
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
  var origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    if (origin) res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(function (req, res, next) {
  console.log('REQUEST:', req.method, req.path);
  console.log('ORIGIN:', req.headers.origin || 'NO ORIGIN');
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/superadmin', require('./routes/superadmin'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/school', require('./routes/school'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/exam', require('./routes/exam'));
app.use('/api/report', require('./routes/report'));
app.use('/api/video', require('./routes/video'));

app.use(function (err, req, res, next) {
  console.error('SERVER ERROR:', err);
  res.status(500).json({ message: err.message || 'Internal Server Error' });
});

async function seedAdmin() {
  try {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      console.log('ADMIN_EMAIL or ADMIN_PASSWORD missing');
      return;
    }

    const email = String(process.env.ADMIN_EMAIL).trim().toLowerCase();
    const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);

    let admin = await User.findOne({ role: 'superadmin' });

    if (!admin) {
      admin = await User.create({
        fullName: 'Super Admin',
        email: email,
        password: hashed,
        role: 'superadmin',
        isActive: true
      });

      console.log('Super Admin created: ' + email);
    } else {
      admin.fullName = 'Super Admin';
      admin.email = email;
      admin.password = hashed;
      admin.role = 'superadmin';
      admin.isActive = true;
      await admin.save();

      console.log('Super Admin synced: ' + email);
    }
  } catch (e) {
    console.log('Seed error:', e.message);
  }
}

mongoose.connect(process.env.MONGODB_URI)
  .then(async function () {
    console.log('MongoDB Connected');
    await seedAdmin();

    var PORT = process.env.PORT || 5000;
    app.listen(PORT, function () {
      console.log('Server running on port ' + PORT);
    });
  })
  .catch(function (err) {
    console.log('MongoDB Error:', err);
  });