const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { userQueries, watchHistoryQueries } = require('../db/queries');
const authService = require('../services/authService');
const cache = require('../utils/cache');

// GET /api/user/profile
router.get('/profile', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/user/profile
router.patch('/profile', requireAuth, async (req, res) => {
  const normalizeArray = (value) => {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
      value
        .map(item => String(item || '').trim().toLowerCase())
        .filter(Boolean)
    ));
  };

  const preferredLanguages = normalizeArray(req.body.preferredLanguages);
  const excludedLanguages = normalizeArray(req.body.excludedLanguages);

  const user = await userQueries.updateLanguagePreferences(req.user.id, {
    preferredLanguages,
    excludedLanguages,
  });

  cache.del('userByToken', req.user.addon_token);
  res.json({ message: 'Profile updated', user });
});

// GET /api/user/addon-url
router.get('/addon-url', requireAuth, async (req, res) => {
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const addonUrl = `${baseUrl}/addon/${req.user.addon_token}/manifest.json`;
  res.json({ addonUrl, token: req.user.addon_token });
});

// GET /api/user/watch-history
router.get('/watch-history', requireAuth, async (req, res) => {
  const requestedLimit = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : 12;

  const items = await watchHistoryQueries.getRecentForUser(req.user.id, { limit });
  res.json(items);
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
