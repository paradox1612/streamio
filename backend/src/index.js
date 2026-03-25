require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { buildManifest, handleCatalog, handleMeta, handleStream } = require('./addon/addonHandler');
const authRoutes = require('./api/authRoutes');
const userRoutes = require('./api/userRoutes');
const providerRoutes = require('./api/providerRoutes');
const adminRoutes = require('./admin/adminRoutes');
const { startScheduler } = require('./jobs/scheduler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

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

app.get('/addon/:token/manifest.json', addonCors, async (req, res) => {
  try {
    const manifest = await buildManifest(req.params.token);
    if (!manifest) return res.status(401).json({ error: 'Invalid token' });
    res.setHeader('Cache-Control', 'no-cache');
    res.json(manifest);
  } catch (err) {
    logger.error('Manifest error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/addon/:token/catalog/:type/:id.json', addonCors, async (req, res) => {
  try {
    const { token, type, id } = req.params;
    const extra = req.query;
    const result = await handleCatalog(token, type, id, extra);
    res.setHeader('Cache-Control', 'max-age=300'); // 5 min cache
    res.json(result);
  } catch (err) {
    logger.error('Catalog error:', err);
    res.json({ metas: [] });
  }
});

app.get('/addon/:token/meta/:type/:id.json', addonCors, async (req, res) => {
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

app.get('/addon/:token/stream/:type/:id.json', addonCors, async (req, res) => {
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

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/providers', providerRoutes);
app.use('/admin', adminRoutes);

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`StreamBridge backend running on port ${PORT}`);
  startScheduler();
});

module.exports = app;
