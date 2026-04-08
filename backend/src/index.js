require('dotenv').config();
require('./utils/vpn').bootstrapVpnProxy();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { buildManifest, handleCatalog, handleMeta, handleStream } = require('./addon/addonHandler');
const authRoutes = require('./api/authRoutes');
const errorReportRoutes = require('./api/errorReportRoutes');
const blogRoutes = require('./api/blogRoutes');
const userRoutes = require('./api/userRoutes');
const providerRoutes = require('./api/providerRoutes');
const freeAccessRoutes = require('./api/freeAccessRoutes');
const previewRoutes = require('./api/previewRoutes');
const adminRoutes = require('./admin/adminRoutes');
const cloudstreamRoutes = require('./api/cloudstreamRoutes');
const homeRoutes = require('./api/homeRoutes');
const errorHandler = require('./middleware/errorHandler');
const { startScheduler } = require('./jobs/scheduler');
const logger = require('./utils/logger');
const cache = require('./utils/cache');
const { getAppRole, shouldRunHttpServer, shouldRunScheduler } = require('./utils/runtimeRole');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', true);

function parseAddonCatalogExtra(req) {
  const extra = { ...req.query };
  const rawPathExtra = req.params.extra;

  if (!rawPathExtra) return extra;

  const params = new URLSearchParams(rawPathExtra.replace(/\//g, '&'));
  for (const [key, value] of params.entries()) {
    if (!(key in extra)) extra[key] = value;
  }

  return extra;
}

// ─── Startup Guards ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'changeme') {
    logger.error('[FATAL] JWT_SECRET is not set or equals "changeme" in production environment. Exiting.');
    process.exit(1);
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

// Security and compression (before other middleware)
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
app.use(compression());

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiters ────────────────────────────────────────────────────────────

// Login: only counts FAILED attempts — brute-force protection
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many failed login attempts. Please try again in 15 minutes.' },
});

// Signup: prevent mass account creation
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many account creation attempts. Please try again in an hour.' },
});

// Password reset: prevent email flooding
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many password reset requests. Please try again in an hour.' },
});

// Preview: strict — unauthenticated endpoint
const previewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many preview requests. Please try again in a few minutes.' },
});

// Addon routes: Stremio polls stream/catalog/meta — allow reasonable burst
const addonLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many addon requests. Please slow down.' },
});

// General: catch-all for all other routes.
// For authenticated requests, key by user ID so users behind shared IPs (corporate
// NAT, VPN) don't consume each other's quota. Falls back to IP for unauthenticated.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        // Decode without verifying — only used as a bucket key, not for access control
        const token = auth.slice(7);
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        if (payload?.userId) return `user:${payload.userId}`;
      } catch {
        // Malformed token — fall through to IP
      }
    }
    return req.ip;
  },
  skip: (req) => req.path === '/health',
  message: { error: 'Too many requests. Please slow down.' },
});

// Apply general limiter to all routes; specific limiters are applied per-route below
app.use(generalLimiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Stremio Addon Routes ─────────────────────────────────────────────────────

// CORS required by Stremio
const addonCors = cors({ origin: '*' });

app.get('/addon/:token/manifest.json', addonCors, addonLimiter, async (req, res) => {
  try {
    const token = req.params.token;
    // Check cache first
    let manifest = cache.get('manifestByToken', token);
    if (!manifest) {
      manifest = await buildManifest(token);
      if (!manifest) return res.status(401).json({ error: 'Invalid token' });
      // Cache the manifest for 60 seconds
      cache.set('manifestByToken', token, manifest);
    }
    res.setHeader('Cache-Control', 'max-age=60');
    res.json(manifest);
  } catch (err) {
    logger.error('Manifest error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

async function catalogHandler(req, res) {
  try {
    const { token, type, id } = req.params;
    const extra = parseAddonCatalogExtra(req);
    const result = await handleCatalog(token, type, id, extra);
    res.setHeader('Cache-Control', 'max-age=300'); // 5 min cache
    res.json(result);
  } catch (err) {
    logger.error('Catalog error:', err);
    res.json({ metas: [] });
  }
}

app.get('/addon/:token/catalog/:type/:id.json', addonCors, addonLimiter, catalogHandler);
app.get('/addon/:token/catalog/:type/:id/:extra(*)?.json', addonCors, addonLimiter, catalogHandler);

app.get('/addon/:token/meta/:type/:id.json', addonCors, addonLimiter, async (req, res) => {
  try {
    const { token, type, id } = req.params;
    const result = await handleMeta(token, type, id);
    res.setHeader('Cache-Control', 'max-age=3600'); // 1 hour
    res.json(result);
  } catch (err) {
    logger.error('Meta error:', err);
    res.json({ meta: null });
  }
});

app.get('/addon/:token/stream/:type/:id.json', addonCors, addonLimiter, async (req, res) => {
  try {
    const { token, type, id } = req.params;
    const result = await handleStream(token, type, id);
    res.setHeader('Cache-Control', 'no-cache'); // Streams should not be cached
    res.json(result);
  } catch (err) {
    logger.error('Stream error:', err);
    res.json({ streams: [] });
  }
});

// ─── CloudStream Plugin Routes ────────────────────────────────────────────────

// Open CORS (same as Stremio addon) — requests come from Android devices, not browsers
app.use('/cloudstream', addonCors, addonLimiter, cloudstreamRoutes);

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/signup', signupLimiter);
app.use('/api/auth/forgot-password', passwordResetLimiter);
app.use('/api/auth/reset-password', passwordResetLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/error-reports', errorReportRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/preview', previewLimiter, previewRoutes);
app.use('/api/user', userRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/free-access', freeAccessRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/admin', adminRoutes);

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const role = getAppRole();

  if (!shouldRunHttpServer()) {
    logger.error(`APP_ROLE=${role} does not allow the HTTP server to start`);
    process.exit(1);
  }

  app.listen(PORT, () => {
    logger.info(`StreamBridge backend running on port ${PORT}`);
    if (shouldRunScheduler()) {
      logger.info(`APP_ROLE=${role} enables the in-process scheduler`);
      startScheduler();
    } else {
      logger.info(`APP_ROLE=${role} disables the in-process scheduler`);
    }
  });
}

module.exports = app;
