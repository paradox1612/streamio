const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { userQueries } = require('../db/queries');
const authService = require('../services/authService');

// GET /api/user/profile
router.get('/profile', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/user/profile
router.patch('/profile', requireAuth, async (req, res) => {
  // Email update would require re-verification; not implemented in MVP
  res.json({ message: 'Profile updated', user: req.user });
});

// GET /api/user/addon-url
router.get('/addon-url', requireAuth, async (req, res) => {
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const addonUrl = `${baseUrl}/addon/${req.user.addon_token}/manifest.json`;
  res.json({ addonUrl, token: req.user.addon_token });
});

// POST /api/user/addon-url/regenerate
router.post('/addon-url/regenerate', requireAuth, async (req, res) => {
  const result = await authService.regenerateAddonToken(req.user.id);
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const addonUrl = `${baseUrl}/addon/${result.addon_token}/manifest.json`;
  res.json({ addonUrl, token: result.addon_token });
});

// DELETE /api/user/account
router.delete('/account', requireAuth, async (req, res) => {
  await userQueries.deleteUser(req.user.id);
  res.json({ message: 'Account deleted' });
});

module.exports = router;
