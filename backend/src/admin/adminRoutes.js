const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const xss = require('xss');
const { requireAdmin, revokeAdminToken } = require('../middleware/auth');
const {
  userQueries,
  blogPostQueries,
  providerQueries,
  providerNetworkQueries,
  vodQueries,
  tmdbQueries,
  matchQueries,
  hostHealthQueries,
  jobQueries,
  errorReportQueries,
  supportReportMessageQueries,
  freeAccessQueries,
  offeringQueries,
  subscriptionQueries,
  systemSettingQueries,
  pool,
} = require('../db/queries');
const tmdbService = require('../services/tmdbService');
const providerService = require('../services/providerService');
const hostHealthService = require('../services/hostHealthService');
const freeAccessService = require('../services/freeAccessService');
const creditService = require('../services/creditService');
const paymentProviderConfigService = require('../services/paymentProviderConfigService');
const ProviderAdapterFactory = require('../providers/ProviderAdapterFactory');
const { jobs } = require('../jobs/scheduler');
const logger = require('../utils/logger');
const { getRuntimeInfo } = require('../utils/runtimeInfo');
const { normalizePlanOptions, resolveSelectedPlan } = require('../utils/marketplacePlans');

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function resolveManagedNetworkHosts(network) {
  const networkHosts = await providerNetworkQueries.listHosts(network.id);
  const activeCustomerHost = networkHosts.find((host) => host.is_active)?.host_url || networkHosts[0]?.host_url || null;
  const legacyProvider = network.legacy_provider_id
    ? await providerQueries.findById(network.legacy_provider_id)
    : null;
  const legacyCustomerHost = legacyProvider?.active_host || legacyProvider?.hosts?.[0] || null;

  return {
    customerHost: activeCustomerHost || legacyCustomerHost || null,
    panelHost: network.reseller_portal_url || activeCustomerHost || legacyCustomerHost || null,
    networkHosts,
  };
}

async function ensureManagedSessionCookie(network, panelHost) {
  if (!(network.xtream_ui_scraped || network.adapter_type === 'xtream_ui_scraper')) return null;
  const xtreamUiScraper = require('../utils/xtreamUiScraper');

  if (network.reseller_session_cookie) {
    const valid = await xtreamUiScraper.isSessionValid(panelHost, network.reseller_session_cookie);
    if (valid) return network.reseller_session_cookie;
  }

  if (!network.reseller_username || !network.reseller_password) {
    throw new Error('Reseller username and password required for auto-login');
  }

  const session = await xtreamUiScraper.autoLogin(
    panelHost,
    network.reseller_username,
    network.reseller_password
  );
  await providerNetworkQueries.update(network.id, { reseller_session_cookie: session });
  return session;
}

async function getManagedNetworkAdapter(network, panelHost = null) {
  const hydrated = {
    ...network,
    reseller_portal_url: network.reseller_portal_url || panelHost || null,
  };
  const adapter = ProviderAdapterFactory.create(hydrated);
  if (hydrated.adapter_type === 'xtream_ui_scraper' || hydrated.xtream_ui_scraped) {
    await adapter.ensureSession();
    if (adapter.network.reseller_session_cookie !== network.reseller_session_cookie) {
      await providerNetworkQueries.update(network.id, {
        reseller_session_cookie: adapter.network.reseller_session_cookie,
      });
    }
  }
  return adapter;
}

// ─── Admin Auth ───────────────────────────────────────────────────────────────

// POST /admin/auth/login
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD;

  if (!username || !password || username !== validUser || password !== validPass) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  // Generate a short-lived admin token with a unique JTI for revocation support
  const adminToken = jwt.sign(
    { admin: true, username, jti: randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ adminToken });
});

// POST /admin/auth/logout
router.post('/auth/logout', requireAdmin, (req, res) => {
  revokeAdminToken(req.headers['x-admin-token']);
  res.json({ message: 'Admin logged out' });
});

// ─── Blog ───────────────────────────────────────────────────────────────────

router.get('/blog-posts', requireAdmin, async (_req, res) => {
  const posts = await blogPostQueries.listAll();
  res.json(posts);
});

router.post('/blog-posts', requireAdmin, async (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const content = xss(String(req.body.content || '').trim());
  const author = String(req.body.author || 'StreamBridge Team').trim();
  const requestedSlug = String(req.body.slug || '').trim();
  const publishedAt = String(req.body.publishedAt || '').trim();
  const readTime = String(req.body.readTime || '').trim();
  const featured = req.body.featured === true;
  const isPublished = req.body.isPublished !== false;
  const tags = Array.isArray(req.body.tags)
    ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : String(req.body.tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

  if (!title || !description || !content || !publishedAt) {
    return res.status(400).json({ error: 'Title, description, content, and published date are required.' });
  }

  const slug = slugify(requestedSlug || title);
  if (!slug) {
    return res.status(400).json({ error: 'A valid slug is required.' });
  }

  const existing = await blogPostQueries.findBySlug(slug, { includeDrafts: true });
  if (existing) {
    return res.status(409).json({ error: `A post with slug "${slug}" already exists.` });
  }

  const post = await blogPostQueries.create({
    slug,
    title,
    description,
    content: readTime ? `<!-- readTime:${readTime} -->\n${content}` : content,
    author: author || 'StreamBridge Team',
    tags,
    featured,
    isPublished,
    publishedAt,
  });

  res.status(201).json(post);
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

// POST /admin/users/:id/credits-adjust
router.post('/users/:id/credits-adjust', requireAdmin, async (req, res) => {
  try {
    const user = await userQueries.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const amountCents = parseInt(req.body.amount_cents, 10);
    const direction = req.body.direction === 'deduct' ? 'deduct' : 'add';
    const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: 'amount_cents must be a positive integer' });
    }

    const description = note || `Admin ${direction} for ${user.email}`;
    let balance;

    if (direction === 'deduct') {
      balance = await creditService.spendCredits(user.id, amountCents, {
        description,
      });
    } else {
      balance = await creditService.addCredits(user.id, amountCents, {
        type: 'admin_grant',
        description,
      });
    }

    res.json({
      success: true,
      user_id: user.id,
      direction,
      amount_cents: amountCents,
      balance_cents: balance,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to adjust credits' });
  }
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
    reportKind: String(req.query.reportKind || ''),
    ticketCategory: String(req.query.ticketCategory || ''),
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

// GET /admin/error-reports/:id/messages
router.get('/error-reports/:id/messages', requireAdmin, async (req, res) => {
  const report = await errorReportQueries.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Error report not found' });

  const messages = await supportReportMessageQueries.listForReport(report.id);
  res.json({ report, messages });
});

// POST /admin/error-reports/:id/messages
router.post('/error-reports/:id/messages', requireAdmin, async (req, res) => {
  const report = await errorReportQueries.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Error report not found' });

  const body = xss(String(req.body.body || '').trim()).slice(0, 4000);
  if (!body) return res.status(400).json({ error: 'Reply body is required' });

  const message = await supportReportMessageQueries.create({
    reportId: report.id,
    authorType: 'admin',
    authorEmail: req.admin?.username || 'admin',
    body,
  });

  res.status(201).json(message);
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

// ─── Marketplace Admin ────────────────────────────────────────────────────────

// GET /api/admin/marketplace — list all offerings (including inactive)
router.get('/marketplace', requireAdmin, async (req, res) => {
  try {
    const offerings = await offeringQueries.listAll();
    const analytics = await subscriptionQueries.getAnalytics();
    res.json({ offerings, analytics });
  } catch (err) {
    logger.error('GET /admin/marketplace:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/marketplace — create offering + Stripe Product/Price
router.post('/marketplace', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      price_cents,
      currency,
      billing_period,
      billing_interval_count,
      trial_days,
      max_connections,
      features,
      plan_options,
      catalog_tags,
      country_codes,
      provider_stats,
      provider_network_id,
      is_featured,
      provisioning_mode,
      reseller_bouquet_ids,
      reseller_notes,
      group_id,
      is_trial,
      trial_ticket_enabled,
      trial_ticket_message,
    } = req.body;

    const normalizedPlans = normalizePlanOptions({
      price_cents,
      currency,
      billing_period,
      billing_interval_count,
      trial_days,
      max_connections,
      reseller_bouquet_ids,
      plan_options,
    });
    const primaryPlan = resolveSelectedPlan({ ...req.body, plan_options: normalizedPlans }, normalizedPlans[0]?.code);

    if (!name || !primaryPlan?.price_cents) {
      return res.status(400).json({ error: 'name and at least one priced plan are required' });
    }
    if (provisioning_mode === 'reseller_line' && !provider_network_id) {
      return res.status(400).json({ error: 'provider_network_id is required for reseller line provisioning' });
    }

    // Create in DB first (without Stripe IDs)
    let offering = await offeringQueries.create({
      name,
      description,
      price_cents: primaryPlan.price_cents,
      currency: primaryPlan.currency,
      billing_period: primaryPlan.billing_period,
      billing_interval_count: primaryPlan.billing_interval_count,
      trial_days: primaryPlan.trial_days,
      max_connections: primaryPlan.max_connections,
      features,
      plan_options: normalizedPlans,
      catalog_tags,
      country_codes,
      provider_stats,
      provider_network_id,
      is_featured,
      provisioning_mode,
      reseller_bouquet_ids,
      reseller_notes,
      group_id,
      is_trial,
      trial_ticket_enabled,
      trial_ticket_message,
    });

    // Sync to Stripe if key is configured
    if (process.env.STRIPE_SECRET_KEY) {
      const stripeService = require('../services/stripeService');
      const { productId, priceId } = await stripeService.createProductAndPrice(offering);
      offering = await offeringQueries.update(offering.id, {
        stripe_product_id: productId,
        stripe_price_id: priceId,
      });
    }

    res.status(201).json(offering);
  } catch (err) {
    logger.error('POST /admin/marketplace:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/marketplace/:id — update offering fields
router.patch('/marketplace/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await offeringQueries.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Offering not found' });
    const nextProvisioningMode = req.body.provisioning_mode ?? existing.provisioning_mode;
    const nextProviderNetworkId = req.body.provider_network_id ?? existing.provider_network_id;
    if (nextProvisioningMode === 'reseller_line' && !nextProviderNetworkId) {
      return res.status(400).json({ error: 'provider_network_id is required for reseller line provisioning' });
    }

    if ('plan_options' in req.body || 'price_cents' in req.body || 'billing_period' in req.body || 'billing_interval_count' in req.body || 'trial_days' in req.body || 'max_connections' in req.body || 'currency' in req.body) {
      const normalizedPlans = normalizePlanOptions({
        ...existing,
        ...req.body,
        reseller_bouquet_ids: req.body.reseller_bouquet_ids ?? existing.reseller_bouquet_ids,
        plan_options: req.body.plan_options ?? existing.plan_options,
      });
      const primaryPlan = normalizedPlans[0];
      req.body.plan_options = normalizedPlans;
      req.body.price_cents = primaryPlan.price_cents;
      req.body.currency = primaryPlan.currency;
      req.body.billing_period = primaryPlan.billing_period;
      req.body.billing_interval_count = primaryPlan.billing_interval_count;
      req.body.trial_days = primaryPlan.trial_days;
      req.body.max_connections = primaryPlan.max_connections;
    }

    let updated = await offeringQueries.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Offering not found' });

    if (process.env.STRIPE_SECRET_KEY) {
      const stripeService = require('../services/stripeService');
      const stripeSync = await stripeService.syncOffering(updated, existing);
      updated = await offeringQueries.update(req.params.id, {
        stripe_product_id: stripeSync.productId,
        stripe_price_id: stripeSync.priceId,
      });
    }

    res.json(updated);
  } catch (err) {
    logger.error('PATCH /admin/marketplace/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/marketplace/:id — soft-deactivate
router.delete('/marketplace/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await offeringQueries.deactivate(req.params.id);
    if (!updated) return res.status(404).json({ error: 'Offering not found' });
    res.json({ message: 'Offering deactivated', offering: updated });
  } catch (err) {
    logger.error('DELETE /admin/marketplace/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Provider Networks ──────────────────────────────────────────────────────

// GET /admin/networks — list all provider networks
router.get('/networks', requireAdmin, async (req, res) => {
  try {
    const networks = await providerNetworkQueries.listAll();
    res.json(networks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/networks — create a new provider network
router.post('/networks', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    const network = await providerNetworkQueries.create({ name: String(name).trim() });
    res.status(201).json(network);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/networks/:id — delete a provider network
router.delete('/networks/:id', requireAdmin, async (req, res) => {
  try {
    const network = await providerNetworkQueries.findById(req.params.id);
    if (!network) return res.status(404).json({ error: 'Network not found' });
    await providerNetworkQueries.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/networks/:id — network details (including hosts)
router.get('/networks/:id', requireAdmin, async (req, res) => {
  try {
    const network = await providerNetworkQueries.findById(req.params.id);
    if (!network) return res.status(404).json({ error: 'Network not found' });
    const hosts = await providerNetworkQueries.listHosts(req.params.id);
    res.json({ network, hosts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /admin/networks/:id — update network (including reseller creds)
router.patch('/networks/:id', requireAdmin, async (req, res) => {
  try {
    const normalizedHosts = Array.isArray(req.body.hosts)
      ? req.body.hosts
        .map((host) => String(host || '').trim())
        .filter(Boolean)
      : null;

    const updated = await providerNetworkQueries.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Network not found' });
    if (normalizedHosts) {
      await providerNetworkQueries.replaceHosts(req.params.id, normalizedHosts);
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/networks/:id/bouquets — fetch reseller bouquets
router.get('/networks/:id/bouquets', requireAdmin, async (req, res) => {
  try {
    const network = await providerNetworkQueries.findById(req.params.id);
    if (!network) return res.status(404).json({ error: 'Network not found' });

    const { panelHost } = await resolveManagedNetworkHosts(network);
    if (!panelHost) {
      return res.status(400).json({ error: 'No reseller portal URL or customer hosts configured for this network' });
    }
    const adapter = await getManagedNetworkAdapter(network, panelHost);
    const bouquets = await adapter.getBouquets();
    res.json(bouquets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/networks/:id/create-line — create a new user line/trial
router.post('/networks/:id/create-line', requireAdmin, async (req, res) => {
  try {
    const network = await providerNetworkQueries.findById(req.params.id);
    if (!network) return res.status(404).json({ error: 'Network not found' });

    const { username, password, maxConnections, expDate, bouquetIds, trial, notes } = req.body;
    const { panelHost } = await resolveManagedNetworkHosts(network);
    if (!panelHost) {
      return res.status(400).json({ error: 'No reseller portal URL or customer hosts configured for this network' });
    }
    const adapter = await getManagedNetworkAdapter(network, panelHost);
    const billingIntervalCount = parseInt(req.body.billingIntervalCount ?? req.body.subscriptionMonths ?? 0, 10) || undefined;
    const result = await adapter.createLine({
      username,
      password,
      maxConnections,
      expDate,
      bouquetIds,
      trial,
      notes,
      billingPeriod: billingIntervalCount ? 'month' : undefined,
      billingIntervalCount,
      subscriptionMonths: billingIntervalCount,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/networks/:id/test-session — check if PHPSESSID is valid
router.post('/networks/:id/test-session', requireAdmin, async (req, res) => {
  try {
    const network = await providerNetworkQueries.findById(req.params.id);
    if (!network) return res.status(404).json({ error: 'Network not found' });
    if (!(network.xtream_ui_scraped || network.adapter_type === 'xtream_ui_scraper')) {
      return res.status(400).json({ error: 'Session testing is only available for scraper networks' });
    }
    if (!network.reseller_session_cookie) return res.status(400).json({ error: 'No session cookie' });

    const { panelHost } = await resolveManagedNetworkHosts(network);
    if (!panelHost) return res.status(400).json({ error: 'No reseller portal URL or customer hosts configured' });

    const xtreamUiScraper = require('../utils/xtreamUiScraper');
    const isValid = await xtreamUiScraper.isSessionValid(panelHost, network.reseller_session_cookie);
    res.json({ valid: isValid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/networks/:id/refresh-session — automate re-login via 2Captcha
router.post('/networks/:id/refresh-session', requireAdmin, async (req, res) => {
  try {
    const network = await providerNetworkQueries.findById(req.params.id);
    if (!network) return res.status(404).json({ error: 'Network not found' });
    if (!(network.xtream_ui_scraped || network.adapter_type === 'xtream_ui_scraper')) {
      return res.status(400).json({ error: 'Session refresh is only available for scraper networks' });
    }
    
    if (!network.reseller_username || !network.reseller_password) {
      return res.status(400).json({ error: 'Reseller username and password required for auto-login' });
    }

    const { panelHost } = await resolveManagedNetworkHosts(network);
    if (!panelHost) return res.status(400).json({ error: 'No reseller portal URL or customer hosts configured' });

    const newSession = await ensureManagedSessionCookie({ ...network, reseller_session_cookie: null }, panelHost);
    res.json({ success: true, session: newSession.substring(0, 8) + '...' });
  } catch (err) {
    logger.error(`[Scraper] Auto-login failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Network Lines (Admin) ───────────────────────────────────────────────────

// GET /admin/networks/:id/lines — all lines provisioned for a specific network
router.get('/networks/:id/lines', requireAdmin, async (req, res) => {
  try {
    const network = await providerNetworkQueries.findById(req.params.id);
    if (!network) return res.status(404).json({ error: 'Network not found' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    const lines = await providerQueries.findNetworkLines(req.params.id, { limit, offset });
    res.json({ network: { id: network.id, name: network.name }, lines, limit, offset });
  } catch (err) {
    logger.error(`GET /admin/networks/:id/lines: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/networks/lines — all lines across all networks (global view)
// Note: must be defined BEFORE /networks/:id to avoid param collision
router.get('/networks-lines', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    const networkId = req.query.network_id || null;
    const lines = await providerQueries.findAllNetworkLines({ limit, offset, networkId });
    res.json({ lines, limit, offset });
  } catch (err) {
    logger.error(`GET /admin/networks-lines: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── CRM Admin ────────────────────────────────────────────────────────────────

// GET /api/admin/crm/status — connection health + sync stats
router.get('/crm/status', requireAdmin, async (req, res) => {
  try {
    const crm = require('../services/twentyCrmService');
    const health = await crm.testConnection();

    const { rows } = await pool.query(
       `SELECT
         (SELECT COUNT(*) FROM users) AS total_users,
         (SELECT COUNT(*) FROM users WHERE twenty_person_id IS NOT NULL) AS synced_users,
         (SELECT COUNT(*) FROM provider_subscriptions) AS total_subscriptions,
         (SELECT COUNT(*) FROM provider_subscriptions WHERE twenty_subscription_id IS NOT NULL) AS synced_subscriptions,
         (SELECT COUNT(*) FROM user_providers) AS total_provider_accesses,
         (SELECT COUNT(*) FROM user_providers WHERE twenty_provider_access_id IS NOT NULL) AS synced_provider_accesses
      `
    );

    res.json({
      ...health,
      api_url: process.env.TWENTY_API_URL || 'not configured',
      api_key_configured: !!process.env.TWENTY_API_KEY,
      sync_stats: rows[0],
    });
  } catch (err) {
    logger.error('GET /admin/crm/status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/crm/provider-access-coverage — local linkage + expiry risk
router.get('/crm/provider-access-coverage', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.status,
         p.active_host,
         p.account_status,
         p.account_expires_at,
         p.account_last_synced_at,
         p.last_checked,
         p.twenty_provider_access_id,
         p.network_id,
         u.id AS user_id,
         u.email AS user_email,
         u.twenty_person_id,
         n.name AS network_name,
         n.twenty_company_id,
         EXISTS(
           SELECT 1
           FROM provider_subscriptions ps
           WHERE ps.user_provider_id = p.id
             AND ps.status != 'cancelled'
         ) AS is_marketplace_managed
       FROM user_providers p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN provider_networks n ON n.id = p.network_id
       ORDER BY p.created_at DESC`
    );

    const now = Date.now();
    const providers = rows.map((row) => {
      const expiresAt = row.account_expires_at ? new Date(row.account_expires_at) : null;
      const daysUntilExpiry = expiresAt && !Number.isNaN(expiresAt.getTime())
        ? Math.ceil((expiresAt.getTime() - now) / (24 * 60 * 60 * 1000))
        : null;

      const riskLevel = (() => {
        if (daysUntilExpiry === null) return 'unknown';
        if (daysUntilExpiry < 0) return 'expired';
        if (daysUntilExpiry <= 3) return 'critical';
        if (daysUntilExpiry <= 7) return 'warning';
        return 'healthy';
      })();

      return {
        id: row.id,
        name: row.name,
        status: row.status,
        active_host: row.active_host,
        account_status: row.account_status,
        account_expires_at: row.account_expires_at,
        account_last_synced_at: row.account_last_synced_at,
        last_checked: row.last_checked,
        twenty_provider_access_id: row.twenty_provider_access_id,
        network_id: row.network_id,
        network_name: row.network_name,
        twenty_company_id: row.twenty_company_id,
        user_id: row.user_id,
        user_email: row.user_email,
        twenty_person_id: row.twenty_person_id,
        source_type: row.is_marketplace_managed ? 'MARKETPLACE' : 'EXTERNAL',
        days_until_expiry: daysUntilExpiry,
        expiry_risk: riskLevel,
        sync_state: {
          personLinked: Boolean(row.twenty_person_id),
          companyLinked: Boolean(row.twenty_company_id),
          providerAccessLinked: Boolean(row.twenty_provider_access_id),
        },
      };
    });

    const summary = providers.reduce((acc, provider) => {
      acc.totalProviders += 1;
      if (provider.sync_state.personLinked) acc.peopleLinked += 1;
      if (provider.sync_state.companyLinked) acc.companiesLinked += 1;
      if (provider.sync_state.providerAccessLinked) acc.providerAccessLinked += 1;
      if (provider.expiry_risk === 'critical') acc.criticalExpiry += 1;
      if (provider.expiry_risk === 'warning') acc.warningExpiry += 1;
      if (provider.expiry_risk === 'expired') acc.expired += 1;
      if (provider.expiry_risk === 'unknown') acc.unknownExpiry += 1;
      return acc;
    }, {
      totalProviders: 0,
      peopleLinked: 0,
      companiesLinked: 0,
      providerAccessLinked: 0,
      criticalExpiry: 0,
      warningExpiry: 0,
      expired: 0,
      unknownExpiry: 0,
    });

    res.json({ summary, providers });
  } catch (err) {
    logger.error('GET /admin/crm/provider-access-coverage:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/crm/people — list People from Twenty CRM
router.get('/crm/people', requireAdmin, async (req, res) => {
  try {
    const crm = require('../services/twentyCrmService');
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const cursor = req.query.cursor || undefined;
    const data = await crm.listPeople({ limit, cursor });
    res.json(data ?? { data: [] });
  } catch (err) {
    logger.error('GET /admin/crm/people:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/crm/tasks — list Tasks from Twenty CRM
router.get('/crm/tasks', requireAdmin, async (req, res) => {
  try {
    const crm = require('../services/twentyCrmService');
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const cursor = req.query.cursor || undefined;
    const data = await crm.listTasks({ limit, cursor });
    res.json(data ?? { data: [] });
  } catch (err) {
    logger.error('GET /admin/crm/tasks:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/crm/sync-all — batch upsert all users + subscriptions
router.post('/crm/sync-all', requireAdmin, async (req, res) => {
  res.json({ message: 'Full sync started in background' });

  // Run async after responding
  setImmediate(async () => {
    const crm = require('../services/twentyCrmService');
    try {
      const { rows: users } = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
      let syncedUsers = 0;
      for (const user of users) {
        await crm.upsertPerson(user);
        syncedUsers++;
      }

      const { rows: subscriptions } = await pool.query(
        `SELECT ps.*, po.name AS offering_name, u.email AS user_email, u.twenty_person_id
         FROM provider_subscriptions ps
         JOIN provider_offerings po ON po.id = ps.offering_id
         JOIN users u ON u.id = ps.user_id
         ORDER BY ps.created_at ASC`
      );

      let syncedSubscriptions = 0;
      for (const subscription of subscriptions) {
        const twentySubId = await crm.upsertSubscription(subscription, subscription.offering_name);
        if (twentySubId && !subscription.twenty_subscription_id) {
          await subscriptionQueries.update(subscription.id, { twenty_subscription_id: twentySubId });
        }
        syncedSubscriptions++;
      }

      const providerNetworks = await providerNetworkQueries.listAllHosts();
      const syncedNetworkIds = new Set();
      for (const host of providerNetworks) {
        if (syncedNetworkIds.has(host.provider_network_id)) continue;
        syncedNetworkIds.add(host.provider_network_id);
        const network = await providerNetworkQueries.findById(host.provider_network_id);
        if (network) await crm.upsertCompany(network);
      }

      const providers = await providerQueries.listAllForCrm();
      let syncedProviders = 0;
      for (const provider of providers) {
        if (provider.network_id && !provider.twenty_company_id) {
          const network = await providerNetworkQueries.findById(provider.network_id);
          if (network) {
            const companyId = await crm.upsertCompany(network);
            provider.twenty_company_id = companyId;
          }
        }
        const twentyProviderAccessId = await crm.upsertProviderAccess(provider);
        if (twentyProviderAccessId && !provider.twenty_provider_access_id) {
          await providerQueries.updateCrmSync(provider.id, {
            twenty_provider_access_id: twentyProviderAccessId,
          });
        }
        syncedProviders++;
      }

      logger.info(
        `[CRM] Full sync complete: ${syncedUsers} users synced, ${syncedSubscriptions} subscriptions synced, ${syncedProviders} provider access records synced`
      );
    } catch (err) {
      logger.error(`[CRM] Full sync failed: ${err.message}`);
    }
  });
});

// ─── Credit Settings ────────────────────────────────────────────────────────

// GET /api/admin/settings/credits — get credits configuration
router.get('/settings/credits', requireAdmin, async (req, res) => {
  try {
    const config = await systemSettingQueries.get('credits_config');
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/settings/credits — update credits configuration
router.put('/settings/credits', requireAdmin, async (req, res) => {
  try {
    const { min_topup_cents, max_topup_cents, presets, allow_custom_amount } = req.body;
    
    // Validation
    if (typeof min_topup_cents !== 'number' || min_topup_cents < 0) {
      return res.status(400).json({ error: 'Invalid min_topup_cents' });
    }
    if (typeof max_topup_cents !== 'number' || max_topup_cents < min_topup_cents) {
      return res.status(400).json({ error: 'Invalid max_topup_cents' });
    }
    if (!Array.isArray(presets)) {
      return res.status(400).json({ error: 'Presets must be an array' });
    }

    const newConfig = {
      min_topup_cents,
      max_topup_cents,
      presets,
      allow_custom_amount: !!allow_custom_amount
    };

    await systemSettingQueries.set('credits_config', newConfig);
    res.json(newConfig);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Payment Provider Settings ───────────────────────────────────────────────

// GET /api/admin/settings/payment-providers — return config (sensitive fields redacted)
router.get('/settings/payment-providers', requireAdmin, async (req, res) => {
  try {
    const config = await paymentProviderConfigService.getAll();
    res.json(paymentProviderConfigService.redactConfig(config));
  } catch (err) {
    logger.error('GET /admin/settings/payment-providers:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/settings/payment-providers — save config
// Empty string for a key field = keep existing value
router.put('/settings/payment-providers', requireAdmin, async (req, res) => {
  try {
    const ALLOWED_PROVIDERS = ['stripe', 'paygate', 'helcim', 'square'];
    const ALLOWED_FIELDS = {
      stripe:  ['enabled', 'visible', 'secret_key', 'webhook_secret', 'publishable_key', 'minimum_amount_cents', 'promo_credit_percent'],
      paygate: ['enabled', 'visible', 'wallet_address', 'api_key', 'minimum_amount_cents', 'promo_credit_percent'],
      helcim:  ['enabled', 'visible', 'api_token', 'webhook_secret', 'company_name', 'minimum_amount_cents', 'promo_credit_percent'],
      square:  ['enabled', 'visible', 'access_token', 'location_id', 'webhook_signature_key', 'environment', 'minimum_amount_cents', 'promo_credit_percent'],
    };

    const updates = {};
    for (const provider of ALLOWED_PROVIDERS) {
      if (!req.body[provider]) continue;
      updates[provider] = {};
      for (const field of ALLOWED_FIELDS[provider]) {
        if (field in req.body[provider]) {
          if (
            (field === 'minimum_amount_cents' || field === 'promo_credit_percent') &&
            (!Number.isInteger(req.body[provider][field]) || req.body[provider][field] < 0)
          ) {
            return res.status(400).json({ error: `Invalid ${field} for ${provider}` });
          }
          updates[provider][field] = req.body[provider][field];
        }
      }
    }

    const saved = await paymentProviderConfigService.saveAll(updates);
    res.json(paymentProviderConfigService.redactConfig(saved));
  } catch (err) {
    logger.error('PUT /admin/settings/payment-providers:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
