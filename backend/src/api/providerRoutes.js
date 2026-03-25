const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const providerService = require('../services/providerService');
const hostHealthService = require('../services/hostHealthService');
const { providerQueries, vodQueries } = require('../db/queries');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// POST /api/providers
router.post('/',
  requireAuth,
  body('name').notEmpty().trim(),
  body('hosts').isArray({ min: 1 }),
  body('username').notEmpty(),
  body('password').notEmpty(),
  validate,
  async (req, res) => {
    try {
      const { name, hosts, username, password } = req.body;
      const provider = await providerService.create(req.user.id, { name, hosts, username, password });
      res.status(201).json(provider);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// GET /api/providers
router.get('/', requireAuth, async (req, res) => {
  const providers = await providerQueries.findByUser(req.user.id);
  res.json(providers);
});

// GET /api/providers/:id
router.get('/:id', requireAuth, async (req, res) => {
  const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });
  res.json(provider);
});

// PATCH /api/providers/:id
router.patch('/:id',
  requireAuth,
  async (req, res) => {
    try {
      const updated = await providerQueries.update(req.params.id, req.user.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Provider not found' });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/providers/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await providerQueries.delete(req.params.id, req.user.id);
  res.json({ message: 'Provider deleted' });
});

// POST /api/providers/:id/test
router.post('/:id/test', requireAuth, async (req, res) => {
  try {
    const results = await providerService.testProvider(req.params.id, req.user.id);
    res.json(results);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/providers/:id/refresh
router.post('/:id/refresh', requireAuth, async (req, res) => {
  try {
    const result = await providerService.refreshCatalog(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/providers/:id/health
router.get('/:id/health', requireAuth, async (req, res) => {
  try {
    // Verify ownership
    const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    const health = await hostHealthService.getProviderHealth(req.params.id);
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/:id/health/recheck
router.post('/:id/health/recheck', requireAuth, async (req, res) => {
  try {
    const health = await hostHealthService.checkSingleProvider(req.params.id, req.user.id);
    res.json(health);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/providers/:id/stats
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const stats = await providerService.getStats(req.params.id, req.user.id);
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/providers/:id/vod
router.get('/:id/vod', requireAuth, async (req, res) => {
  try {
    const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const { type, page, limit, search, matched } = req.query;
    const items = await vodQueries.getByProvider(req.params.id, {
      type,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 200),
      search,
      matched: matched === 'true' ? true : matched === 'false' ? false : undefined,
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/providers/:id/unmatched
router.get('/:id/unmatched', requireAuth, async (req, res) => {
  try {
    const provider = await providerQueries.findByIdAndUser(req.params.id, req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    const items = await vodQueries.getUnmatchedTitles(req.params.id);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
