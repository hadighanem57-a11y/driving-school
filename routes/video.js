const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const { auth, authorize } = require('../middleware/auth');

router.post('/', auth, authorize('admin', 'superadmin'), async function(req, res) {
  try {
    var video = await Video.create(req.body);
    res.status(201).json(video);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', auth, async function(req, res) {
  try {
    var filter = { isActive: true };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.language) filter.language = req.query.language;
    var videos = await Video.find(filter).sort({ createdAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', auth, authorize('admin', 'superadmin'), async function(req, res) {
  try {
    var video = await Video.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(video);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', auth, authorize('admin', 'superadmin'), async function(req, res) {
  try {
    await Video.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;