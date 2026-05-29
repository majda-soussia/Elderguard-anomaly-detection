// src/api/middleware/adminMiddleware.js
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ detail: 'Admin access required.' });
    }
    next();
  };
  module.exports = { requireAdmin };