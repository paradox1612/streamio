const fetch = require('node-fetch');
const { providerQueries, providerNetworkQueries, hostHealthQueries, pool } = require('../db/queries');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

const PING_TIMEOUT = 10000; // 10s
const PROVIDER_HEALTH_BATCH_SIZE = Math.max(1, parseInt(process.env.HEALTH_CHECK_BATCH_SIZE || '2', 10));
const PROVIDER_HEALTH_MIN_INTERVAL_MS = Math.max(0, parseInt(process.env.HEALTH_CHECK_PROVIDER_MIN_INTERVAL_MS || '3600000', 10));
// The scheduled health job runs on the same interval as this throttle, and a run started
// moments after the previous tick leaves the next tick ~1s short of the full interval — so a
// strict `elapsed < interval` test skips every other run (checks end up ~2h apart, not 1h).
// Allow a small grace so an "almost due" check still runs on schedule.
const PROVIDER_HEALTH_INTERVAL_GRACE_MS = Math.min(60000, Math.floor(PROVIDER_HEALTH_MIN_INTERVAL_MS * 0.05));

function isAuthenticatedXtreamResponse(data) {
  if (!data || typeof data !== 'object') return false;
  const auth = data?.user_info?.auth;
  if (auth === 0 || auth === '0' || auth === false) return false;
  return Boolean(data.user_info);
}

async function pingHost(host, username, password) {
  const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  // Probe up to twice so a single transient blip (a fast network error or a 5xx) doesn't
  // mark an otherwise-healthy host offline. Deterministic outcomes (4xx, unauthenticated
  // response) and timeouts fail fast — retrying those would only add latency.
  const maxAttempts = 2;
  let lastResponseTime = PING_TIMEOUT;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      lastResponseTime = Date.now() - start;
      if (res.ok) {
        let data = null;
        try {
          data = await res.json();
        } catch (err) {
          data = null;
        }
        if (isAuthenticatedXtreamResponse(data)) {
          return { status: 'online', responseTimeMs: lastResponseTime };
        }
        // Reachable but unauthenticated / non-JSON — deterministic, don't retry.
        return { status: 'offline', responseTimeMs: lastResponseTime };
      }
      // 4xx is deterministic (bad creds/URL); only a 5xx is worth a retry.
      if (res.status < 500) {
        return { status: 'offline', responseTimeMs: lastResponseTime };
      }
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        // Timed out — already slow; don't double the latency by retrying.
        return { status: 'offline', responseTimeMs: PING_TIMEOUT };
      }
      // Fast network error (ECONNRESET / ECONNREFUSED / DNS) — fall through and retry once.
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return { status: 'offline', responseTimeMs: lastResponseTime };
}

const hostHealthService = {
  async checkAll() {
    const providers = await providerQueries.getAllForHealthCheck();
    logger.info(`Health check: checking ${providers.length} providers`);

    for (let i = 0; i < providers.length; i += PROVIDER_HEALTH_BATCH_SIZE) {
      const batch = providers.slice(i, i + PROVIDER_HEALTH_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(provider => hostHealthService.checkProvider(provider))
      );
      // Log any failures
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'rejected') {
          logger.warn(`Health check failed for provider ${batch[j].id}: ${results[j].reason?.message}`);
        }
      }
    }

    logger.info('Health check complete');
  },

  async checkProvider(provider, { force = false } = {}) {
    const lastCheckedAt = provider.last_checked_at || provider.last_checked || provider.updated_at || null;
    if (!force && PROVIDER_HEALTH_MIN_INTERVAL_MS > 0 && lastCheckedAt) {
      const elapsedMs = Date.now() - new Date(lastCheckedAt).getTime();
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < PROVIDER_HEALTH_MIN_INTERVAL_MS - PROVIDER_HEALTH_INTERVAL_GRACE_MS) {
        logger.info(`Skipping provider ${provider.id} health check; last checked ${elapsedMs}ms ago (throttle: ${PROVIDER_HEALTH_MIN_INTERVAL_MS}ms)`);
        return;
      }
    }

    let bestHost = null;
    let bestTime = Infinity;
    const networkHosts = provider.network_id
      ? await providerNetworkQueries.listHosts(provider.network_id)
      : [];
    const activeNetworkHosts = networkHosts.filter((row) => row.is_active !== false);
    const hostsToCheck = activeNetworkHosts.length
      ? activeNetworkHosts.map((row) => row.host_url)
      : networkHosts.length
        ? networkHosts.map((row) => row.host_url)
      : provider.hosts;

    // Snapshot which hosts were already offline at the previous check so we can prune
    // hosts that stay offline across consecutive checks (standalone providers only).
    let previousOffline = new Set();
    if (!provider.network_id) {
      try {
        const prevHealth = await hostHealthQueries.getByProvider(provider.id);
        if (Array.isArray(prevHealth)) {
          previousOffline = new Set(
            prevHealth.filter((row) => row.status === 'offline').map((row) => row.host_url)
          );
        }
      } catch (_) { /* best-effort — pruning simply won't run this cycle */ }
    }

    const pingResults = await Promise.all(
      hostsToCheck.map(async (host) => {
        const result = await pingHost(host, provider.username, provider.password);
        return { host, ...result };
      })
    );

    for (const result of pingResults) {
      await hostHealthQueries.upsert({
        providerId: provider.id,
        hostUrl: result.host,
        status: result.status,
        responseTimeMs: result.responseTimeMs,
      });

      if (result.status === 'online' && result.responseTimeMs < bestTime) {
        bestTime = result.responseTimeMs;
        bestHost = result.host;
      }
    }

    // Hysteresis: don't demote a provider on a single all-failed cycle. If every host
    // failed this check but the current active_host was healthy at the previous check,
    // treat it as a transient blip — keep the last-known-good host and stay online. Only
    // demote to offline once the failure persists across two consecutive checks. (The
    // background check runs at most hourly, so a too-eager demote strands playback.)
    let resolvedActiveHost = bestHost;
    let resolvedStatus = bestHost ? 'online' : 'offline';
    if (!bestHost && provider.active_host && !provider.network_id && !previousOffline.has(provider.active_host)) {
      logger.warn(`Provider ${provider.name} (${provider.id}): all hosts failed this cycle; preserving last-known-good host ${provider.active_host} (will demote if it fails again)`);
      resolvedActiveHost = provider.active_host;
      resolvedStatus = 'online';
    }
    await providerQueries.updateHealth(provider.id, {
      activeHost: resolvedActiveHost,
      status: resolvedStatus,
    });
    await cache.del('hostHealth', provider.id);

    // Prune hosts that stayed offline across two consecutive checks (standalone
    // providers only — network hosts are admin-managed). Never prune the chosen best
    // host and never empty the list. Disable with HOST_PRUNE_ENABLED=false.
    if (!provider.network_id && process.env.HOST_PRUNE_ENABLED !== 'false' && Array.isArray(provider.hosts) && bestHost) {
      const offlineNow = new Set(pingResults.filter((r) => r.status === 'offline').map((r) => r.host));
      const survivingHosts = provider.hosts.filter(
        (host) => host === bestHost || !(previousOffline.has(host) && offlineNow.has(host))
      );
      if (survivingHosts.length > 0 && survivingHosts.length < provider.hosts.length) {
        const removed = provider.hosts.filter((host) => !survivingHosts.includes(host));
        await pool.query('UPDATE user_providers SET hosts = $2 WHERE id = $1', [provider.id, survivingHosts]);
        logger.info(`Pruned ${removed.length} persistently-offline host(s) from provider ${provider.id}: ${removed.join(', ')}`);
      }
    }

    // After health check, refresh account info to ensure CRM sync and expiry tasks
    if (bestHost) {
      const providerService = require('./providerService');
      const providerForAccount = await providerQueries.findById(provider.id);
      if (providerForAccount) {
        providerService.getProviderAccountInfo(providerForAccount, { forceRefresh: true }).catch(err => {
          logger.warn(`Failed to refresh account info for provider ${provider.id} after health check: ${err.message}`);
        });
      }
    }

    logger.info(
      `Provider ${provider.name} (${provider.id}): ${bestHost ? `online via ${bestHost}` : 'offline'}`
    );
  },

  async checkSingleProvider(providerId, userId) {
    const provider = userId
      ? await providerQueries.findByIdAndUser(providerId, userId)
      : await providerQueries.findById(providerId);

    if (!provider) throw Object.assign(new Error('Provider not found'), { status: 404 });
    await hostHealthService.checkProvider(provider, { force: true });
    const health = await hostHealthQueries.getByProvider(providerId);
    return health;
  },

  async getProviderHealth(providerId) {
    // Check cache first
    const cached = await cache.get('hostHealth', providerId);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const health = await hostHealthQueries.getByProvider(providerId);
    const hasOnline = Array.isArray(health) && health.some((h) => h.status === 'online');
    // Cache for 5 minutes when we have a usable (online) snapshot. Never pin an
    // all-offline/empty snapshot for that long — a provider that just recovered would
    // otherwise look dead until the TTL lapsed. Cache misses briefly (30s) so the next
    // request re-reads fresh DB state, which the background/on-demand checks update.
    await cache.set('hostHealth', providerId, health, hasOnline ? undefined : 30);
    return health;
  },
};

module.exports = hostHealthService;
