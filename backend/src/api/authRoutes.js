const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');
const { requireAuth } = require('../middleware/auth');
const eventBus = require('../utils/eventBus');

// Per-email rate limit for forgot-password: max 3 requests per hour per email.
// This is complementary to the IP-based limiter — it prevents distributed probing
// of a single target email across many IPs.
const forgotPasswordByEmail = new Map(); // email -> { count, resetAt }

function checkEmailRateLimit(email) {
  const now = Date.now();
  const entry = forgotPasswordByEmail.get(email);
  if (entry && entry.resetAt > now) {
    if (entry.count >= 3) return false;
    entry.count++;
  } else {
    forgotPasswordByEmail.set(email, { count: 1, resetAt: now + 60 * 60 * 1000 });
  }
  return true;
}

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// POST /api/auth/signup
router.post('/signup',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await authService.signup(email, password);
      eventBus.emit('user.created', result.user || result);
      res.status(201).json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// POST /api/auth/login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      eventBus.emit('user.logged_in', { userId: result.user?.id || result.id, lastSeen: new Date() });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// POST /api/auth/logout (client-side token drop; server-side is stateless)
router.post('/logout', requireAuth, (req, res) => {
  res.json({ message: 'Logged out' });
});

// POST /api/auth/google
router.post('/google',
  body('accessToken').notEmpty(),
  validate,
  async (req, res) => {
    try {
      const result = await authService.googleLogin(req.body.accessToken);
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// POST /api/auth/forgot-password
router.post('/forgot-password',
  body('email').isEmail().normalizeEmail(),
  validate,
  async (req, res) => {
    if (!checkEmailRateLimit(req.body.email)) {
      return res.status(429).json({ error: 'Too many reset requests for this email. Please try again later.' });
    }
    try {
      const token = await authService.forgotPassword(req.body.email);
      // In production, send email. Dev: return token in response.
      res.json({
        message: 'If that email exists, a reset link has been sent.',
        ...(process.env.NODE_ENV !== 'production' && token ? { debug_reset_token: token } : {}),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/auth/reset-password
router.post('/reset-password',
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
  validate,
  async (req, res) => {
    try {
      await authService.resetPassword(req.body.token, req.body.password);
      res.json({ message: 'Password reset successfully' });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// PATCH /api/auth/change-password
router.patch('/change-password',
  requireAuth,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
  validate,
  async (req, res) => {
    try {
      await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
      res.json({ message: 'Password changed successfully' });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

module.exports = router;
