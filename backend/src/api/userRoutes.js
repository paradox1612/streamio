const router = require('express').Router();
const xss = require('xss');
const { requireAuth } = require('../middleware/auth');
const { userQueries, watchHistoryQueries, errorReportQueries, supportReportMessageQueries } = require('../db/queries');
const authService = require('../services/authService');
const cache = require('../utils/cache');

function getAddonBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL;

  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;

  return `${protocol}://${req.get('host')}`;
}

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

  await cache.del('userByToken', req.user.addon_token);
  res.json({ message: 'Profile updated', user });
});

// GET /api/user/addon-url
router.get('/addon-url', requireAuth, async (req, res) => {
  const baseUrl = getAddonBaseUrl(req);
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

// POST /api/user/watch-history
// Body: { vodId, rawTitle, tmdbId, imdbId, vodType, progressPct }
router.post('/watch-history', requireAuth, async (req, res) => {
  try {
    const { vodId, rawTitle, tmdbId, imdbId, vodType, progressPct } = req.body;
    if (!rawTitle) return res.status(400).json({ error: 'rawTitle is required' });

    await watchHistoryQueries.upsertFromVod({
      userId: req.user.id,
      vodId,
      rawTitle,
      tmdbId,
      imdbId,
      vodType,
      progressPct: progressPct || 0,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user/addon-url/regenerate
router.post('/addon-url/regenerate', requireAuth, async (req, res) => {
  const result = await authService.regenerateAddonToken(req.user.id);
  const baseUrl = getAddonBaseUrl(req);
  const addonUrl = `${baseUrl}/addon/${result.addon_token}/manifest.json`;
  res.json({ addonUrl, token: result.addon_token });
});

// DELETE /api/user/account
router.delete('/account', requireAuth, async (req, res) => {
  await userQueries.deleteUser(req.user.id);
  res.json({ message: 'Account deleted' });
});

// GET /api/user/support-tickets
router.get('/support-tickets', requireAuth, async (req, res) => {
  const tickets = await errorReportQueries.listTicketsForUser(req.user.id);
  res.json(tickets);
});

// GET /api/user/support-tickets/:id/messages
router.get('/support-tickets/:id/messages', requireAuth, async (req, res) => {
  const ticket = await errorReportQueries.findTicketForUser(req.params.id, req.user.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const messages = await supportReportMessageQueries.listForReport(ticket.id);
  res.json({ ticket, messages });
});

// POST /api/user/support-tickets/:id/messages
router.post('/support-tickets/:id/messages', requireAuth, async (req, res) => {
  const ticket = await errorReportQueries.findTicketForUser(req.params.id, req.user.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const body = xss(String(req.body.body || '').trim()).slice(0, 4000);
  if (!body) return res.status(400).json({ error: 'Reply body is required' });

  const message = await supportReportMessageQueries.create({
    reportId: ticket.id,
    authorType: 'user',
    authorEmail: req.user.email,
    body,
  });

  res.status(201).json(message);
});

module.exports = router;
