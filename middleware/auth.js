const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async function (req, res, next) {
  try {
    if (req.method === 'OPTIONS') return res.sendStatus(204);

    var authHeader = req.header('Authorization');
    if (!authHeader) return res.status(401).json({ message: 'No token' });
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Invalid token format' });

    var token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ message: 'No token' });
    if (!process.env.JWT_SECRET) return res.status(500).json({ message: 'Server configuration error' });

    var decoded = jwt.verify(token, process.env.JWT_SECRET);
    var user = await User.findById(decoded.id).select('-password');

    if (!user) return res.status(401).json({ message: 'User not found' });
    if (!user.isActive) return res.status(401).json({ message: 'Account disabled' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const authorize = function () {
  var roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'User missing' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Not authorized' });
    next();
  };
};

module.exports = { auth, authorize };