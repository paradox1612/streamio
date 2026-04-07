const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { requireAdmin } = require('../middleware/auth');
const { userQueries, providerQueries, vodQueries, tmdbQueries, matchQueries, hostHealthQueries, jobQueries, errorReportQueries, freeAccessQueries, pool } = require('../db/queries');
const tmdbService = require('../services/tmdbService');
const providerService = require('../services/providerService');
const hostHealthService = require('../services/hostHealthService');
const freeAccessService = require('../services/freeAccessService');
const { jobs } = require('../jobs/scheduler');
const logger = require('../utils/logger');
const { getRuntimeInfo } = require('../utils/runtimeInfo');

// ─── Admin Auth ───────────────────────────────────────────────────────────────

// POST /admin/auth/login
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD;

  if (!username || !password || username !== validUser || password !== validPass) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  // Generate a short-lived admin token
  const adminToken = jwt.sign(
    { admin: true, username },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  req.app.locals.adminToken = adminToken;
  res.json({ adminToken });
});

// POST /admin/auth/logout
router.post('/auth/logout', requireAdmin, (req, res) => {
  req.app.locals.adminToken = null;
  res.json({ message: 'Admin logged out' });
});

// ─── Users ───────────────────────────────────────────────────────────────────

// GET /admin/users
router.get('/users', requireAdmin, async (req, res) => {
  const { search = '', limit = 50, offset = 0 } = req.query;
  const users = await userQueries.listAll({ search, limit: parseInt(limit), offset: parseInt(offset) });
  res.json(users);
});

// GET /admin/users/:id
router.get('/users/:id', requireAdmin, async (req, res) => {
  const user = await userQueries.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const providers = await providerQueries.findByUser(req.params.id);
  const freeAccess = await freeAccessQueries.findLatestAssignmentForUser(req.params.id);
  res.json({ user, providers, freeAccess });
});

// DELETE /admin/users/:id
router.delete('/users/:id', requireAdmin, async (req, res) => {
  await userQueries.deleteUser(req.params.id);
  res.json({ message: 'User deleted' });
});

// PATCH /admin/users/:id/suspend
router.patch('/users/:id/suspend', requireAdmin, async (req, res) => {
  const { suspend } = req.body;
  await userQueries.setActive(req.params.id, !suspend);
  res.json({ message: suspend ? 'User suspended' : 'User activated' });
});

// POST /admin/users/:id/impersonate
router.post('/users/:id/impersonate', requireAdmin, async (req, res) => {
  const user = await userQueries.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.is_active) return res.status(403).json({ error: 'Cannot impersonate a suspended user' });
  const token = jwt.sign(
    { userId: user.id, email: user.email, impersonatedBy: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
  logger.info(`Admin impersonating user: ${user.email}`);
  res.json({ token, user: { id: user.id, email: user.email } });
});

// ─── Providers ───────────────────────────────────────────────────────────────

// GET /admin/providers
router.get('/providers', requireAdmin, async (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  const providers = await providerQueries.listAll({ limit: parseInt(limit), offset: parseInt(offset) });
  res.json(providers);
});

// GET /admin/providers/:id
router.get('/providers/:id', requireAdmin, async (req, res) => {
  const provider = await providerQueries.findById(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });
  const [vodStats, matchStats, health] = await Promise.all([
    vodQueries.getStats(provider.id),
    vodQueries.getMatchStats(provider.id),
    hostHealthQueries.getByProvider(provider.id),
  ]);
  res.json({ provider, vodStats, matchStats, health });
});

// DELETE /admin/providers/:id
router.delete('/providers/:id', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('DELETE FROM user_providers WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Provider not found' });
  res.json({ message: 'Provider deleted' });
});

// POST /admin/providers/:id/refresh
router.post('/providers/:id/refresh', requireAdmin, async (req, res) => {
  try {
    const provider = await providerQueries.findById(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    const result = await providerService.refreshCatalog(provider.id, provider.user_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────────

// GET /admin/stats/overview
router.get('/stats/overview', requireAdmin, async (req, res) => {
  const [userCount, providerCount, vodCount, matchStats, lastRuns] = await Promise.all([
    userQueries.count(),
    providerQueries.count(),
    vodQueries.totalCount(),
    matchQueries.globalStats(),
    jobQueries.getLastRuns(),
  ]);
  res.json({
    userCount,
    providerCount,
    vodCount,
    matchStats,
    lastRuns,
    runtime: getRuntimeInfo(),
  });
});

// GET /admin/stats/matching
router.get('/stats/matching', requireAdmin, async (req, res) => {
  const [globalStats, unmatched, tmdbMovieCount, tmdbSeriesCount] = await Promise.all([
    matchQueries.globalStats(),
    matchQueries.listUnmatched({ limit: 50 }),
    tmdbQueries.movieCount(),
    tmdbQueries.seriesCount(),
  ]);
  res.json({ globalStats, unmatched, tmdbMovieCount, tmdbSeriesCount });
});

// GET /admin/stats/health
router.get('/stats/health', requireAdmin, async (req, res) => {
  const health = await hostHealthQueries.getAll();
  res.json(health);
});

// GET /admin/error-reports
router.get('/error-reports', requireAdmin, async (req, res) => {
  const reports = await errorReportQueries.list({
    search: String(req.query.search || ''),
    status: String(req.query.status || ''),
    source: String(req.query.source || ''),
    limit: parseInt(req.query.limit || '100', 10),
    offset: parseInt(req.query.offset || '0', 10),
  });
  res.json(reports);
});

// GET /admin/error-reports/:id
router.get('/error-reports/:id', requireAdmin, async (req, res) => {
  const report = await errorReportQueries.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Error report not found' });
  res.json(report);
});

// PATCH /admin/error-reports/:id
router.patch('/error-reports/:id', requireAdmin, async (req, res) => {
  const status = String(req.body.status || '');
  if (!['open', 'reviewed', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const report = await errorReportQueries.updateStatus(req.params.id, status);
  if (!report) return res.status(404).json({ error: 'Error report not found' });
  res.json(report);
});

// ─── TMDB ─────────────────────────────────────────────────────────────────────

// POST /admin/tmdb/sync
router.post('/tmdb/sync', requireAdmin, async (req, res) => {
  res.json({ message: 'TMDB sync started in background' });
  tmdbService.syncExports().catch(err => logger.error('Admin TMDB sync failed:', err));
});

// GET /admin/tmdb/status
router.get('/tmdb/status', requireAdmin, async (req, res) => {
  const [movieCount, seriesCount, lastRuns] = await Promise.all([
    tmdbQueries.movieCount(),
    tmdbQueries.seriesCount(),
    jobQueries.getHistory('tmdbSync', 5),
  ]);
  res.json({ movieCount, seriesCount, lastRuns });
});

// POST /admin/tmdb/rematch
router.post('/tmdb/rematch', requireAdmin, async (req, res) => {
  res.json({ message: 'Re-matching started in background' });
  tmdbService.runMatching(10000).catch(err => logger.error('Admin rematch failed:', err));
});

// ─── System ───────────────────────────────────────────────────────────────────

// POST /admin/system/refresh-all
router.post('/system/refresh-all', requireAdmin, async (req, res) => {
  res.json({ message: 'Catalog refresh for all providers started in background' });
  jobs.catalogRefreshJob().catch(err => logger.error('Admin refresh-all failed:', err));
});

// POST /admin/system/run-job/:jobName
router.post('/system/run-job/:jobName', requireAdmin, async (req, res) => {
  const { jobName } = req.params;
  const availableJobs = Object.keys(jobs);
  if (!availableJobs.includes(jobName)) {
    return res.status(400).json({ error: `Unknown job. Available: ${availableJobs.join(', ')}` });
  }
  res.json({ message: `Job ${jobName} started in background` });
  jobs[jobName]().catch(err => logger.error(`Admin job ${jobName} failed:`, err));
});

// GET /admin/system/jobs
router.get('/system/jobs', requireAdmin, async (req, res) => {
  const lastRuns = await jobQueries.getLastRuns();
  res.json({
    jobs: ['healthCheckJob', 'tmdbSyncJob', 'catalogRefreshJob', 'matchingJob', 'epgRefreshJob', 'freeAccessExpiryJob', 'freeAccessCatalogRefreshJob'],
    lastRuns,
    runtime: getRuntimeInfo(),
  });
});

// ─── Free Access ─────────────────────────────────────────────────────────────

router.get('/free-access/groups', requireAdmin, async (req, res) => {
  const groups = await freeAccessQueries.listProviderGroups();
  res.json(groups);
});

router.post('/free-access/groups', requireAdmin, async (req, res) => {
  try {
    const group = await freeAccessQueries.createProviderGroup({
      name: req.body.name,
      trialDays: req.body.trialDays || 7,
      notes: req.body.notes || null,
      isActive: req.body.isActive !== false,
    });
    res.status(201).json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/free-access/groups/:id', requireAdmin, async (req, res) => {
  try {
    const group = await freeAccessQueries.updateProviderGroup(req.params.id, req.body);
    if (!group) return res.status(404).json({ error: 'Free access group not found' });
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/free-access/groups/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await freeAccessQueries.deleteProviderGroup(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Free access group not found' });
    res.json({ message: 'Free access group deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/free-access/groups/:id', requireAdmin, async (req, res) => {
  const group = await freeAccessQueries.findProviderGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Free access group not found' });
  const [hosts, accounts] = await Promise.all([
    freeAccessQueries.listHostsByGroup(req.params.id),
    freeAccessQueries.listAccountsByGroup(req.params.id),
  ]);
  res.json({ group, hosts, accounts });
});

router.post('/free-access/groups/:id/hosts', requireAdmin, async (req, res) => {
  try {
    const host = await freeAccessQueries.addHost({
      providerGroupId: req.params.id,
      host: String(req.body.host || '').replace(/\/+$/, ''),
      priority: req.body.priority || 100,
      isActive: req.body.isActive !== false,
    });
    res.status(201).json(host);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/free-access/groups/:id/hosts/:hostId', requireAdmin, async (req, res) => {
  try {
    const deleted = await freeAccessQueries.deleteHost(req.params.hostId, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Free access host not found' });
    res.json({ message: 'Free access host deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/free-access/groups/:id/accounts', requireAdmin, async (req, res) => {
  try {
    const account = await freeAccessQueries.addAccount({
      providerGroupId: req.params.id,
      username: req.body.username,
      password: req.body.password,
      status: req.body.status || 'available',
    });
    res.status(201).json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/free-access/groups/:id/accounts/:accountId', requireAdmin, async (req, res) => {
  try {
    const deleted = await freeAccessQueries.deleteAccount(req.params.accountId, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Free access account not found' });
    res.json({ message: 'Free access account deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/free-access/groups/:id/refresh', requireAdmin, async (req, res) => {
  try {
    const result = await freeAccessService.refreshProviderGroupCatalog(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/free-access/assignments', requireAdmin, async (req, res) => {
  const assignments = await freeAccessQueries.listAssignments({
    limit: parseInt(req.query.limit || '100', 10),
    offset: parseInt(req.query.offset || '0', 10),
  });
  res.json(assignments);
});

// GET /admin/system/db
router.get('/system/db', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT schemaname, tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        (SELECT COUNT(*) FROM information_schema.columns c
         WHERE c.table_schema = schemaname AND c.table_name = tablename) as columns
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
