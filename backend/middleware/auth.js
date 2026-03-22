const jwt = require('jsonwebtoken');
const { readCollection } = require('../db');

const protect = (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const users = readCollection('users');
    const user = users.find((u) => u.id === decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    // Attach user without password
    const { password: _, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid or expired.' });
  }
};

module.exports = { protect };
