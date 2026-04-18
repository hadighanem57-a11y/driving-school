const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // مهم: ما نوقف طلبات الـ OPTIONS تبع الـ CORS preflight
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    console.log('--- AUTH START ---');
    console.log('Method:', req.method);
    console.log('Path:', req.originalUrl);
    console.log('Authorization header:', req.header('Authorization') || 'MISSING');

    const authHeader = req.header('Authorization');

    if (!authHeader) {
      console.log('No Authorization header received');
      return res.status(401).json({ message: 'No token' });
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.log('Authorization header is not Bearer token');
      return res.status(401).json({ message: 'Invalid token format' });
    }

    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      console.log('Bearer token is empty');
      return res.status(401).json({ message: 'No token' });
    }

    console.log('Token extracted successfully');
    console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);

    if (!process.env.JWT_SECRET) {
      console.log('JWT_SECRET is missing from environment variables');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
      message: 'Invalid token'
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
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