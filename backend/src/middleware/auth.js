const jwt = require('jsonwebtoken');
const authService = require('../services/authService');
const { userQueries } = require('../db/queries');
const { touchUserLastSeen } = require('../utils/userActivity');
const logger = require('../utils/logger');

// ─── Admin Token Blocklist ────────────────────────────────────────────────────
// Maps jti -> expiry (ms). Entries are pruned once expired so memory stays bounded.
const revokedAdminJtis = new Map();

function pruneRevokedJtis() {
  const now = Date.now();
  for (const [jti, expiresAt] of revokedAdminJtis) {
    if (expiresAt < now) revokedAdminJtis.delete(jti);
  }
}

function revokeAdminToken(token) {
  try {
    const payload = jwt.decode(token);
    if (payload?.jti && payload?.exp) {
      revokedAdminJtis.set(payload.jti, payload.exp * 1000);
    }
  } catch {
    // Malformed token — nothing to revoke
  }
}

// ─── User Auth Middleware ─────────────────────────────────────────────────────

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
    touchUserLastSeen(user.id).catch((err) => logger.debug('touchUserLastSeen failed:', err));
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Admin Auth Middleware ────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    pruneRevokedJtis();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.admin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (payload.jti && revokedAdminJtis.has(payload.jti)) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

module.exports = { requireAuth, requireAdmin, revokeAdminToken };
