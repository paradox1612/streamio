const jwt = require('jsonwebtoken');
const authService = require('../services/authService');
const { userQueries } = require('../db/queries');

// User JWT middleware
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = header.slice(7);
    const payload = authService.verifyJwt(token);
    const user = await userQueries.findById(payload.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid token or account suspended' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Admin JWT middleware — verifies the signed admin token directly (survives restarts)
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.admin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

module.exports = { requireAuth, requireAdmin };
