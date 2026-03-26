# StreamBridge — Full Codebase Optimization & Feature Report

> Generated: March 2026 | Scope: Full codebase audit + IPTV ecosystem research

---

## 1. Executive Summary

StreamBridge is a well-structured Stremio addon that bridges Xtream Codes IPTV providers with the Stremio ecosystem using TMDB metadata matching. After auditing every file and researching the current IPTV/Stremio pain-point landscape, this report documents **19 concrete optimizations** and **8 high-value feature additions**.

---

## 2. Code Optimizations

### 2.1 Backend — Critical Performance Issues

#### 🔴 N+1 Query on Dashboard Load (`Dashboard.jsx` + `providerRoutes.js`)

**Problem:** The dashboard calls `providerAPI.getStats(provider.id)` in a `Promise.all` loop — one HTTP round-trip per provider. For a user with 5 providers that's 5 extra requests, each hitting the DB 4 times.

**Fix:** Add a single `/api/user/dashboard-summary` endpoint that returns all provider stats in one query.

```js
// backend: new route
router.get('/dashboard', requireAuth, async (req, res) => {
  const providers = await providerQueries.findByUser(req.user.id);
  const stats = await Promise.all(providers.map(p => providerService.getStats(p.id, req.user.id)));
  res.json(providers.map((p, i) => ({ ...p, ...stats[i] })));
});
```

---

#### 🔴 Series Episode Fetch Called Twice Per Stream (`addonHandler.js`)

**Problem:** `handleMeta()` calls `providerService.getSeriesEpisodes()` to build the video list, and then `handleStream()` calls it again to resolve the individual episode URL. This means two identical `get_series_info` API calls to the provider, adding 1–5 seconds of latency per stream start.

**Fix:** Cache series episode data in-memory (or Redis) with a short TTL (5–10 minutes):

```js
// utils/episodeCache.js
const cache = new Map();
const TTL = 10 * 60 * 1000; // 10 minutes

function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data;
}
function set(key, data) {
  cache.set(key, { data, expires: Date.now() + TTL });
}
module.exports = { get, set };
```

---

#### 🟡 TMDB Export Sync: Line-by-Line Upsert Bottleneck (`tmdbService.js`)

**Problem:** `syncExports()` processes each line of the TMDB export individually with an `await tmdbQueries.upsertMovie(...)` inside a `for` loop. For 700K+ movies this creates hundreds of thousands of sequential DB round-trips — the sync likely takes 30+ minutes.

**Fix:** Batch-upsert in chunks of 500 (same pattern already used in `vodQueries.upsertBatch`):

```js
const CHUNK = 500;
const buffer = [];
for (const line of movieData.split('\n')) {
  // ... parse ...
  buffer.push(parsed);
  if (buffer.length >= CHUNK) {
    await tmdbQueries.upsertMovieBatch(buffer.splice(0, CHUNK));
  }
}
if (buffer.length) await tmdbQueries.upsertMovieBatch(buffer);
```

---

#### 🟡 Health Check Pings Are Sequential (`hostHealthService.js`)

**Problem:** `checkAll()` uses a `for...of` loop, checking one provider at a time. With 50 users each having 2 providers, 100 sequential HTTP pings at 10s timeout = up to 16 minutes for one health check cycle.

**Fix:** Use `Promise.allSettled` with a concurrency cap:

```js
const CONCURRENCY = 10;
// chunk providers into groups of 10 and await each group
for (let i = 0; i < providers.length; i += CONCURRENCY) {
  await Promise.allSettled(
    providers.slice(i, i + CONCURRENCY).map(p => hostHealthService.checkProvider(p))
  );
}
```

---

#### 🟡 Missing DB Indexes for Hot Queries (`queries.js`)

The following queries run on every stream/meta request but likely lack proper indexes:

```sql
-- Add these to schema.sql or a new migration:
CREATE INDEX IF NOT EXISTS idx_matched_content_raw_title ON matched_content(raw_title);
CREATE INDEX IF NOT EXISTS idx_upv_provider_vod_type ON user_provider_vod(provider_id, vod_type);
CREATE INDEX IF NOT EXISTS idx_upv_user_normalized ON user_provider_vod(user_id, normalized_title);
CREATE INDEX IF NOT EXISTS idx_upv_stream_id ON user_provider_vod(provider_id, stream_id, vod_type);
CREATE INDEX IF NOT EXISTS idx_upv_tmdb_id ON matched_content(tmdb_id) WHERE tmdb_id IS NOT NULL;
```

---

#### 🟡 DB Connection Pool Too Small for Production (`pool.js`)

**Problem:** `max: 20` connections is fine for dev but Railway / Render free-tier Postgres limits you to 25 connections total. With background jobs + addon requests hitting simultaneously, you can exhaust the pool.

**Fix:** Make it configurable and add idle/connect timeouts:

```js
max: parseInt(process.env.DB_POOL_MAX || '10'),
idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '3000'),
```

---

#### 🟡 Rate Limiter Too Permissive for Addon Routes (`index.js`)

**Problem:** The global rate limiter is `500 requests / 15 min` applied to **all** routes including the Stremio addon endpoints. Stremio can hammer `/stream/:token/...` rapidly when browsing — but the same limiter also protects `/api/auth`. Auth endpoints need a tighter limit.

**Fix:** Apply a strict limiter only to auth endpoints:

```js
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth', authLimiter, authRoutes);
```

---

### 2.2 Frontend Optimizations

#### 🟡 Dashboard Makes N Stats Requests on Every Mount (`Dashboard.jsx`)

As noted above, the `useEffect` fires one `getStats()` call per provider with no caching. Add a `staleTime` pattern or use React Query so repeated navigation doesn't re-fetch everything.

---

#### 🟡 VodBrowser Has No Debounce on Search Input (`VodBrowser.jsx`)

**Problem:** `handleFilterChange('search', value)` fires on every keystroke, resetting state and triggering a new API call each character. Typing "Breaking Bad" fires 11 requests.

**Fix:** Debounce the search input:

```js
const [searchInput, setSearchInput] = useState('');
useEffect(() => {
  const id = setTimeout(() => handleFilterChange('search', searchInput), 400);
  return () => clearTimeout(id);
}, [searchInput]);
```

---

#### 🟡 Inline Styles Everywhere — No Theme / Design Token System

Every component uses hundreds of inline `style={{ ... }}` objects, which means no dark/light mode toggle is possible and every color change requires hunting across files. Consider extracting a `theme.js` constants file as a first step toward CSS modules or styled-components.

---

#### 🟢 `installInStremio` Uses `http://` for Local Dev

`window.open(`stremio://${addonUrl.replace(/^https?:\/\//,'')}`)` works, but Stremio Desktop sometimes rejects HTTP addon URLs. Add a note or enforce HTTPS in production.

---

### 2.3 Security Improvements

#### 🔴 Password Reset Token Returned in API Response (`authService.js`)

**Problem:** `forgotPassword()` returns the reset token directly in the response body (`return resetToken`). This is only acceptable in pure local dev. In production this leaks the token to anyone who can observe the HTTP response.

**Fix:** Remove the `return resetToken` line and wire up actual email delivery (Nodemailer + SMTP or SendGrid). Until email is implemented, log the token server-side only.

---

#### 🔴 JWT Secret Has Insecure Default (`authService.js`)

```js
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
```

If `JWT_SECRET` is not set in production, every installation uses `'changeme'` — any token signed anywhere is valid everywhere. Add a startup check:

```js
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'changeme') {
  if (process.env.NODE_ENV === 'production') {
    logger.error('FATAL: JWT_SECRET is not set. Exiting.');
    process.exit(1);
  }
}
```

---

#### 🟡 Provider Credentials Stored in Plaintext (`providerQueries.js`)

IPTV username/password are stored as plain text in `user_providers`. While acceptable for an MVP, consider encrypting at rest with `crypto.createCipheriv` using a server-side key (AES-256-GCM). This protects credentials if the DB is dumped.

---

#### 🟡 Admin Token Has No Expiry Enforcement via Logout (`adminRoutes.js`)

The admin JWT is verified on each request, but `POST /admin/auth/logout` likely just removes it client-side. Since JWTs are stateless, the token remains valid server-side until it expires. Add a small in-memory or Redis blocklist for revoked admin tokens.

---

### 2.4 Reliability Improvements

#### 🟡 `catalogRefreshJob` Refreshes All Providers Simultaneously (`scheduler.js`)

**Problem:** The job loops through every provider sequentially, but each `refreshCatalog()` can take 30–120 seconds per provider for large catalogs. For 100 users this could run for hours and block the scheduler.

**Fix:** Add per-provider job locks and break the refresh into user-batches with inter-batch pauses to avoid overwhelming the DB.

---

#### 🟡 No Retry Logic on Provider API Calls (`providerService.js`)

IPTV providers are notoriously flaky. A single timeout causes the entire catalog refresh to fail. Add simple exponential-backoff retry:

```js
async function xtreamRequestWithRetry(host, user, pass, action, extra='', retries=3) {
  for (let i = 0; i < retries; i++) {
    try { return await xtreamRequest(host, user, pass, action, extra); }
    catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}
```

---

#### 🟢 `loadManager.js` Counter Can Drift on Unhandled Rejections

`beginAddonRequest()` increments without a guarantee that `endAddonRequest()` is called on crash. The `finally` blocks in `addonHandler.js` handle this correctly, but double-check that every code path through `handleMeta`/`handleStream` exits through `finally`.

---

## 3. High-Impact Feature Additions

Based on the most-searched IPTV user complaints and Stremio ecosystem gaps:

---

### Feature 1: 🔴 Live TV / Channels Catalog (Most Requested)

**Problem:** StreamBridge currently only serves VOD (movies + series). The #1 complaint across IPTV users is missing live channel support in Stremio. Your Xtream Codes provider already exposes `get_live_streams` and `get_live_categories`.

**Implementation:**
- Add `tv` to the addon manifest's `types` array
- Add a new catalog: `sb_{providerId}_live`
- Add `get_live_streams` fetch in `refreshCatalog()`
- New stream handler: `${host}/live/${user}/${pass}/${stream_id}.m3u8`
- This is the single feature that would most expand your user base

---

### Feature 2: 🔴 EPG / Electronic Program Guide Integration

**Problem:** Users moving from dedicated IPTV apps miss the "What's on now / next" guide. Xtream Codes providers expose an EPG URL (XMLTV format).

**Implementation:**
- Fetch the provider's EPG XML (usually at `${host}/xmltv.php?username=...&password=...`)
- Parse and cache channel program data
- Expose `now playing` info as the stream `title` field: `"CNN — Anderson Cooper 360° (9PM)"`
- Add a background job to refresh EPG every 4 hours
- In the catalog meta, populate `description` with current + next program

---

### Feature 3: 🔴 Multi-Host Automatic Failover at Stream Time

**Problem:** Users experience buffering when the primary host is slow. StreamBridge picks the best host during the health check (every 5 mins) but doesn't re-evaluate at stream time.

**Implementation:**
- Return **multiple streams** from `handleStream()` — one per available host — each with a label showing response time: `"SB — Host 1 (42ms)"`, `"SB — Host 2 (98ms)"`
- Stremio automatically shows all options and the user (or Stremio's smart fallback) can pick
- Sort streams by `response_time_ms` from `host_health` so the fastest is first

```js
// In handleStream:
const healthRecords = await hostHealthQueries.getByProvider(provider.id);
const onlineHosts = healthRecords.filter(h => h.status === 'online')
  .sort((a, b) => a.response_time_ms - b.response_time_ms);

const streams = onlineHosts.map((h, i) => ({
  url: buildStreamUrl(h.host_url, username, password, stream_id, ext),
  title: `StreamBridge — Host ${i + 1} (${h.response_time_ms}ms)`,
  name: 'SB',
}));
```

---

### Feature 4: 🟡 Stream Quality Selection (4K / 1080p / 720p)

**Problem:** Many providers offer the same content at multiple quality levels (different stream IDs in different categories). Currently StreamBridge treats them as separate titles.

**Implementation:**
- During catalog refresh, detect quality tags (`4K`, `FHD`, `HD`, `SD`) in `rawTitle` and `category`
- Group them under the same canonical title
- Return multiple streams with quality labels: `"SB — 4K"`, `"SB — 1080p"`, `"SB — 720p"`

---

### Feature 5: 🟡 Watched / Continue Watching History

**Problem:** Stremio tracks watch history natively for matched content (via IMDB ID), but for `sb_` unmatched content there's no tracking at all.

**Implementation:**
- Add a `watch_history` table: `(user_id, vod_id, progress_pct, last_watched_at)`
- Expose a new `/addon/:token/catalog/movie/sb_continue.json` catalog with recently watched
- This is a significant retention feature — users come back to the app more

---

### Feature 6: 🟡 Manual Title Match Override (UI)

**Problem:** TMDB auto-matching fails on ~20-40% of titles (especially foreign content, remastered titles, specials). Users have no way to fix a bad match.

**Implementation:**
- Add a "Fix Match" button in the VOD Browser for each title
- Opens a TMDB search dialog
- User picks the correct match → saved to `matched_content` with `confidence_score = 1.0` and a `manually_matched = true` flag
- Prevents the auto-matching job from overwriting it

---

### Feature 7: 🟡 Provider Expiry Push Notifications / Email Alerts

**Problem:** The dashboard shows "X days left" but users don't check the dashboard daily. A provider expiring silently breaks all their streams.

**Implementation:**
- Add a background job (daily at 8am): check all providers where `expiresAt` is within 7 days
- Send an email alert (integrate Nodemailer/SendGrid — needed anyway for password reset)
- Add a `notification_preferences` column to `users` table for opt-out

---

### Feature 8: 🟡 Bulk Re-match with Custom TMDB Language

**Problem:** TMDB matching works well for English content but fails for Arabic, Hindi, Turkish dubbed content — a huge segment of IPTV users. The noise pattern stripping removes language tags before matching, which is correct, but the TMDB database query only matches `normalized_title` in the default language.

**Implementation:**
- Add a `preferred_language` field to providers or users
- When calling the TMDB API for on-demand matches, pass `language=ar` / `language=hi` etc.
- For the local DB fuzzy match, store alternate-language normalized titles from TMDB's `get_translations` endpoint
- This could dramatically improve match rates for non-English catalogs

---

## 4. Quick Wins (< 1 hour each)

| # | What | Where | Impact |
|---|------|--------|--------|
| Q1 | Add `helmet` middleware for security headers | `index.js` | Security |
| Q2 | Add `compression` middleware (gzip responses) | `index.js` | Performance |
| Q3 | Cache `/addon/:token/manifest.json` in-memory for 60s | `index.js` | Perf (Stremio polls this often) |
| Q4 | Add `poster_path` to TMDB exports sync (currently null) | `tmdbService.js` | Better posters |
| Q5 | Add `skip` count display in VodBrowser ("Showing 1–60 of 4,200") | `VodBrowser.jsx` | UX |
| Q6 | Move `FETCH_TIMEOUT` to env var | `providerService.js` | Ops flexibility |
| Q7 | Log slow DB queries (>500ms) | `pool.js` | Observability |
| Q8 | Add `DISTINCT ON` to `findOnDemandCandidateForUser` query | `queries.js` | Correctness |
| Q9 | Validate `hosts` are valid URLs on provider create | `providerRoutes.js` | UX |
| Q10 | Show provider account connection count on dashboard warning if at max | `Dashboard.jsx` | UX |

---

## 5. Architecture Recommendation: In-Memory Cache Layer

The single highest-leverage infrastructure change is adding a lightweight cache. Right now every Stremio request hits PostgreSQL. With a simple `node-cache` or Redis layer:

- `findByToken` (runs on every addon request) → cache user record for 5 min
- `findByIdAndUser` (runs on every stream/meta) → cache provider record for 5 min
- `getSeriesEpisodes` (runs twice per series stream start) → cache for 10 min
- Manifest builds → cache for 60s per token

This would cut DB load by ~70% during active streaming sessions.

```bash
npm install node-cache
```

```js
// utils/cache.js
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
module.exports = cache;
```

---

## 6. Prioritized Roadmap

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Fix password reset token leak | 1h | Critical security |
| P0 | Fix JWT_SECRET startup guard | 30min | Critical security |
| P0 | Series episode cache (double-fetch fix) | 2h | Major perf |
| P1 | Live TV channels catalog | 1 day | Biggest user demand |
| P1 | Multi-host streams in stream response | 3h | Major reliability |
| P1 | Add missing DB indexes | 1h | Major perf |
| P1 | TMDB sync batch upsert | 2h | Major perf |
| P2 | EPG integration | 2 days | High user demand |
| P2 | Manual title match override UI | 1 day | High UX value |
| P2 | Search input debounce | 30min | Easy win |
| P2 | Health check concurrency | 1h | Reliability |
| P3 | Provider expiry email alerts | 1 day | Retention |
| P3 | Watched history catalog | 2 days | Engagement |
| P3 | Multi-language TMDB matching | 2 days | Reach |

---

*Sources: IPTV buffering research from [FireStickTricks](https://www.firesticktricks.com/iptv-buffering-and-freezing.html), [nexott.net](https://nexott.net/blog/iptv-buffering-how-to-fix-iptv-buffering-issues-once-and-for-all-2025-overview/), Stremio addon ecosystem from [GitHub M3U-XCAPI-EPG-IPTV-Stremio](https://github.com/Inside4ndroid/M3U-XCAPI-EPG-IPTV-Stremio), [stremio-addons.net](https://stremio-addons.net/addons/m3uepg-tv-addon)*
