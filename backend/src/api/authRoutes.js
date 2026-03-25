const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');
const { requireAuth } = require('../middleware/auth');

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

// POST /api/auth/forgot-password
router.post('/forgot-password',
  body('email').isEmail().normalizeEmail(),
  validate,
  async (req, res) => {
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
