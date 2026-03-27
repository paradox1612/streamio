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
 *   - Only a sample of channel/title names is returned (no stream URLs)
 *
 * NOTE: Bad provider credentials return HTTP 400 (not 401) so the global
 * axios interceptor on the frontend does not treat this as a session expiry.
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

/**
 * Validates credentials and measures round-trip latency.
 * Returns { ok, latencyMs, accountInfo, serverInfo } on success
 * or { ok: false, error } on failure.
 */
async function validateCredentials(host, username, password) {
  const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    clearTimeout(timer);

    if (!res.ok) return { ok: false, error: `Provider returned HTTP ${res.status}` };
    const data = await res.json();

    const auth = data?.user_info?.auth;
    if (auth === 0 || auth === '0' || auth === false) {
      return { ok: false, error: 'Invalid username or password' };
    }
    if (!data?.user_info) {
      return { ok: false, error: 'Unexpected response from provider' };
    }

    const u = data.user_info;
    const s = data.server_info || {};
    const expDate = u.exp_date ? new Date(Number(u.exp_date) * 1000) : null;

    // Derive a clean server hostname from server_info if available
    let serverHost = null;
    if (s.url) {
      try {
        serverHost = new URL(s.url).hostname;
      } catch (_) {
        serverHost = s.url;
      }
    }

    return {
      ok: true,
      latencyMs,
      accountInfo: {
        status: u.status || 'active',
        isTrial: u.is_trial === 1 || u.is_trial === '1' || u.is_trial === true,
        expiresAt: expDate ? expDate.toISOString() : null,
        maxConnections: u.max_connections != null ? parseInt(u.max_connections, 10) : null,
        activeConnections: u.active_cons != null ? parseInt(u.active_cons, 10) : null,
        allowedFormats: Array.isArray(u.allowed_output_formats) ? u.allowed_output_formats : [],
      },
      serverInfo: {
        host: serverHost,
        timezone: s.timezone || null,
        port: s.port || null,
        httpsPort: s.https_port || null,
      },
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      error: err.name === 'AbortError' ? 'Connection timed out — provider unreachable' : 'Could not reach provider',
    };
  }
}

// Sample up to `max` items across categories for variety
function sampleItems(items, getCategoryFn, getNameFn, max = 12) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const byCategory = {};
  for (const item of items) {
    const cat = getCategoryFn(item) || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(getNameFn(item));
  }

  const cats = Object.keys(byCategory);
  const perCat = Math.max(1, Math.ceil(max / cats.length));
  const result = [];

  for (const cat of cats) {
    for (const name of byCategory[cat].slice(0, perCat)) {
      result.push({ category: cat, name });
      if (result.length >= max) return result;
    }
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

    let { host, username, password } = req.body;
    host = host.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(host)) host = `http://${host}`;

    // 1 — Validate credentials (HTTP 400 for bad creds — NOT 401)
    const authResult = await validateCredentials(host, username, password);
    if (!authResult.ok) {
      return res.status(400).json({ error: authResult.error });
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

    const liveCount   = Array.isArray(liveStreams) ? liveStreams.length : 0;
    const movieCount  = Array.isArray(vodMovies)   ? vodMovies.length  : 0;
    const seriesCount = Array.isArray(vodSeries)   ? vodSeries.length  : 0;

    // Sample live channels
    const liveSample = sampleItems(
      liveStreams,
      ch => categoryMap[String(ch.category_id)] || firstNonEmpty(ch.category_name, ch.group) || 'General',
      ch => ch.name || String(ch.stream_id),
      12
    );

    // Sample VOD (movies + series combined)
    const vodSample = sampleItems(
      [...(Array.isArray(vodMovies) ? vodMovies.slice(0, 500) : []),
       ...(Array.isArray(vodSeries) ? vodSeries.slice(0, 500) : [])],
      item => firstNonEmpty(item.category_name) || 'VOD',
      item => item.name || String(item.stream_id || item.series_id),
      8
    );

    return res.json({
      latencyMs: authResult.latencyMs,
      accountInfo: authResult.accountInfo,
      serverInfo: authResult.serverInfo,
      counts: {
        live: liveCount,
        movies: movieCount,
        series: seriesCount,
        total: liveCount + movieCount + seriesCount,
      },
      liveSample,
      vodSample,
    });
  }
);

module.exports = router;
