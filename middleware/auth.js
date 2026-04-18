const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    console.log('--- AUTH START ---');
    console.log('Authorization header:', req.header('Authorization') || 'MISSING');

    const token = req.header('Authorization');

    if (!token) {
      console.log('No token received');
      return res.status(401).json({ message: 'No token' });
    }

    const clean = token.replace('Bearer ', '');
    console.log('Token extracted successfully');
    console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);

    const decoded = jwt.verify(clean, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);

    const user = await User.findById(decoded.id).select('-password');
    console.log('User found:', user ? user.email : 'NO USER');

    if (!user) {
      console.log('User not found in database');
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      console.log('User account is disabled');
      return res.status(401).json({ message: 'Account disabled' });
    }

    req.user = user;
    console.log('AUTH OK - role:', user.role);
    console.log('--- AUTH END ---');

    next();
  } catch (err) {
    console.log('AUTH ERROR:', err.message);
    return res.status(401).json({
      message: 'Invalid token',
      error: err.message
    });
  }
};

const authorize = function() {
  var roles = Array.prototype.slice.call(arguments);

  return function(req, res, next) {
    console.log('--- AUTHORIZE START ---');
    console.log('User role:', req.user ? req.user.role : 'NO USER');
    console.log('Allowed roles:', roles);

    if (!req.user) {
      return res.status(401).json({ message: 'User missing in request' });
    }

    if (!roles.includes(req.user.role)) {
      console.log('NOT AUTHORIZED');
      return res.status(403).json({ message: 'Not authorized' });
    }

    console.log('AUTHORIZE OK');
    console.log('--- AUTHORIZE END ---');
    next();
  };
};

module.exports = { auth, authorize };