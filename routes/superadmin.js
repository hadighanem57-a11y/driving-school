const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');

// Create school
router.post('/create-school', auth, authorize('superadmin', 'admin'), async function(req, res) {
  try {
    var schoolName = req.body.schoolName;
    var licenseNumber = req.body.licenseNumber;
    var phone = req.body.phone;
    var address = req.body.address;
    var email = req.body.email;
    var password = req.body.password;
   var t = translations[ctx.lang]; //
   
    if (!schoolName || !licenseNumber || !phone || !address || !email || !password) {
      return res.status(400).json({
        message: 'ALL fields are required: School Name, License Number, Phone, Address, Email, Password'
      });
    }

    var exists = await User.findOne({
      $or: [
        { email: email },
        { licenseNumber: licenseNumber }
      ]
    });

    if (exists) {
      return res.status(400).json({ message: 'Email or License already exists' });
    }

    var hashed = await bcrypt.hash(password, 10);

    var school = await User.create({
      fullName: schoolName,
      schoolName: schoolName,
      licenseNumber: licenseNumber,
      phone: phone,
      address: address,
      email: email,
      password: hashed,
      role: 'school',
      isActive: true
    });

    res.status(201).json({
      message: 'School created',
      school: {
        id: school._id,
        schoolName: school.schoolName,
        email: school.email
      }
    });
  } catch (err) {
    console.log('CREATE SCHOOL ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Get all schools
router.get('/schools', auth, authorize('superadmin', 'admin'), async function(req, res) {
  try {
    var schools = await User.find({ role: 'school' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(schools);
  } catch (err) {
    console.log('GET SCHOOLS ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Create admin
router.post('/create-admin', auth, authorize('superadmin'), async function(req, res) {
  try {
    if (!req.body.fullName || !req.body.email || !req.body.password) {
      return res.status(400).json({ message: 'fullName, email, password required' });
    }

    var exists = await User.findOne({ email: req.body.email });
    if (exists) {
      return res.status(400).json({ message: 'Email exists' });
    }

    var hashed = await bcrypt.hash(req.body.password, 10);

    await User.create({
      fullName: req.body.fullName,
      email: req.body.email,
      password: hashed,
      phone: req.body.phone || '',
      role: 'admin',
      isActive: true
    });

    res.status(201).json({ message: 'Admin created' });
  } catch (err) {
    console.log('CREATE ADMIN ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Toggle school
router.put('/toggle-school/:id', auth, authorize('superadmin'), async function(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid school ID' });
    }

    var school = await User.findById(req.params.id);
    if (!school) {
      return res.status(404).json({ message: 'Not found' });
    }

    school.isActive = !school.isActive;
    await school.save();

    res.json({
      message: school.isActive ? 'School activated' : 'School deactivated'
    });
  } catch (err) {
    console.log('TOGGLE SCHOOL ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Delete school
router.delete('/school/:id', auth, authorize('superadmin'), async function(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid school ID' });
    }

    await User.deleteMany({ schoolId: req.params.id });
    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'School and students deleted' });
  } catch (err) {
    console.log('DELETE SCHOOL ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Edit school
router.put('/school/:id', auth, authorize('superadmin', 'admin'), async function(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid school ID' });
    }

    var update = {};

    if (req.body.schoolName) {
      update.schoolName = req.body.schoolName;
      update.fullName = req.body.schoolName;
    }
    if (req.body.phone) update.phone = req.body.phone;
    if (req.body.address) update.address = req.body.address;
    if (req.body.licenseNumber) update.licenseNumber = req.body.licenseNumber;

    var school = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('-password');

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    res.json(school);
  } catch (err) {
    console.log('EDIT SCHOOL ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Change school password
router.put('/school-password/:id', auth, authorize('superadmin', 'admin'), async function(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid school ID' });
    }

    if (!req.body.newPassword) {
      return res.status(400).json({ message: 'Password required' });
    }

    var hashed = await bcrypt.hash(req.body.newPassword, 10);
    await User.findByIdAndUpdate(req.params.id, { password: hashed });

    res.json({ message: 'Password changed' });
  } catch (err) {
    console.log('CHANGE SCHOOL PASSWORD ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;