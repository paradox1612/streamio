const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const freeAccessService = require('../services/freeAccessService');
const cache = require('../utils/cache');

router.get('/status', requireAuth, async (req, res) => {
  const status = await freeAccessService.getStatusForUser(req.user.id);
  res.json(status);
});

router.post('/start', requireAuth, async (req, res) => {
  try {
    const assignment = await freeAccessService.startOrExtend(req.user.id);
    cache.del('userByToken', req.user.addon_token);
    cache.del('manifestByToken', req.user.addon_token);
    res.status(201).json({
      message: 'Free access started',
      assignment,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/extend', requireAuth, async (req, res) => {
  try {
    const status = await freeAccessService.getStatusForUser(req.user.id);
    if (status.status === 'active') {
      return res.status(409).json({ error: 'Free access is already active' });
    }

    const assignment = await freeAccessService.startOrExtend(req.user.id);
    cache.del('userByToken', req.user.addon_token);
    cache.del('manifestByToken', req.user.addon_token);
    res.json({
      message: 'Free access extended',
      assignment,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
