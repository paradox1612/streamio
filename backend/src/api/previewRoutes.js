/**
 * POST /api/preview
 *
 * Public (no auth) endpoint — lets landing-page visitors test their
 * Xtream credentials and receive a sampled preview of their catalog
 * without creating an account first.
 *
 * Security:
 *   - Strict per-IP rate limit (5 req / 15 min) applied in index.js
 *   - Credentials are NEVER persisted — used only for the outbound fetch
 *   - Only a small sample of channel names is returned (no stream URLs)
 */

const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const fetch = require('node-fetch');

const FETCH_TIMEOUT = 15000; // 15 s

// ── Helpers ──────────────────────────────────────────────────────────────────

function firstNonEmpty(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v != null && typeof v !== 'string') return String(v);
  }
  return null;
}

async function xtreamFetch(host, username, password, action) {
  const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${action}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    clearTimeout(timer);
    return null;
  }
}

async function validateCredentials(host, username, password) {
  const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();

    const auth = data?.user_info?.auth;
    if (auth === 0 || auth === '0' || auth === false) {
      return { ok: false, error: 'Invalid credentials' };
    }
    if (!data?.user_info) {
      return { ok: false, error: 'Unexpected provider response' };
    }

    const u = data.user_info;
    const expDate = u.exp_date ? new Date(Number(u.exp_date) * 1000) : null;

    return {
      ok: true,
      accountInfo: {
        status: u.status || 'active',
        isTrial: u.is_trial === 1 || u.is_trial === '1' || u.is_trial === true,
        expiresAt: expDate ? expDate.toISOString() : null,
        maxConnections: u.max_connections != null ? parseInt(u.max_connections, 10) : null,
        activeConnections: u.active_cons != null ? parseInt(u.active_cons, 10) : null,
      },
    };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: err.name === 'AbortError' ? 'Connection timed out' : err.message };
  }
}

// Sample up to `max` items; pick diverse entries across categories
function sampleChannels(channels, categoryMap, max = 18) {
  if (!Array.isArray(channels) || channels.length === 0) return [];

  // Group by category
  const byCategory = {};
  for (const ch of channels) {
    const catId = String(ch.category_id || '');
    const catName = categoryMap[catId] || firstNonEmpty(ch.category_name, ch.group) || 'General';
    if (!byCategory[catName]) byCategory[catName] = [];
    byCategory[catName].push(ch.name || String(ch.stream_id));
  }

  const cats = Object.keys(byCategory);
  const perCat = Math.max(1, Math.floor(max / cats.length));
  const result = [];

  for (const cat of cats) {
    const items = byCategory[cat].slice(0, perCat);
    for (const name of items) {
      result.push({ category: cat, name });
      if (result.length >= max) break;
    }
    if (result.length >= max) break;
  }

  return result;
}

// ── Route ────────────────────────────────────────────────────────────────────

router.post(
  '/',
  body('host').notEmpty().trim(),
  body('username').notEmpty().trim(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'host, username, and password are required.' });
    }

    // Normalise host — strip trailing slashes, ensure protocol
    let { host, username, password } = req.body;
    host = host.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(host)) host = `http://${host}`;

    // 1 — Validate credentials
    const authResult = await validateCredentials(host, username, password);
    if (!authResult.ok) {
      return res.status(401).json({ error: authResult.error || 'Could not connect to provider.' });
    }

    // 2 — Fetch category maps + streams in parallel (best-effort)
    const [liveCats, liveStreams, vodMovies, vodSeries] = await Promise.all([
      xtreamFetch(host, username, password, 'get_live_categories'),
      xtreamFetch(host, username, password, 'get_live_streams'),
      xtreamFetch(host, username, password, 'get_vod_streams'),
      xtreamFetch(host, username, password, 'get_series'),
    ]);

    // Build category id → name map
    const categoryMap = {};
    if (Array.isArray(liveCats)) {
      for (const c of liveCats) {
        const id = firstNonEmpty(c.category_id, c.id);
        const name = firstNonEmpty(c.category_name, c.name) || 'General';
        if (id) categoryMap[String(id)] = name;
      }
    }

    const liveCount  = Array.isArray(liveStreams) ? liveStreams.length : 0;
    const movieCount = Array.isArray(vodMovies)   ? vodMovies.length  : 0;
    const seriesCount = Array.isArray(vodSeries)  ? vodSeries.length  : 0;

    const channelSample = sampleChannels(liveStreams, categoryMap, 18);

    // Return preview — no credentials echoed back, no stream URLs
    return res.json({
      accountInfo: authResult.accountInfo,
      counts: {
        live: liveCount,
        movies: movieCount,
        series: seriesCount,
        total: liveCount + movieCount + seriesCount,
      },
      channelSample,
    });
  }
);

module.exports = router;
