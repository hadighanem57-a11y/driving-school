const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

router.post('/login', async function (req, res) {
  try {
    var email = String(req.body.email || '').trim().toLowerCase();
    var password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    var user = await User.findOne({ email: email });

    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(400).json({ message: 'Account is disabled' });
    }

    var isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Server configuration error' });
    }

    var token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token: token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        schoolName: user.schoolName,
        category: user.category,
        language: user.language,
        schoolId: user.schoolId,
        phone: user.phone,
        address: user.address,
        studentId: user.studentId,
        licenseNumber: user.licenseNumber
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/me', auth, function (req, res) {
  res.json(req.user);
});

router.put('/change-password', auth, async function (req, res) {
  try {
    if (!req.body.oldPassword || !req.body.newPassword) {
      return res.status(400).json({ message: 'oldPassword and newPassword required' });
    }

    var user = await User.findById(req.user._id);
    var isMatch = await bcrypt.compare(req.body.oldPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Old password wrong' });
    }

    user.password = await bcrypt.hash(req.body.newPassword, 10);
    await user.save();

    res.json({ message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;