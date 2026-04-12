const fetch = require('node-fetch');
const { providerQueries, providerNetworkQueries, hostHealthQueries } = require('../db/queries');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

const PING_TIMEOUT = 10000; // 10s
const PROVIDER_HEALTH_BATCH_SIZE = Math.max(1, parseInt(process.env.HEALTH_CHECK_BATCH_SIZE || '2', 10));
const PROVIDER_HEALTH_MIN_INTERVAL_MS = Math.max(0, parseInt(process.env.HEALTH_CHECK_PROVIDER_MIN_INTERVAL_MS || '3600000', 10));

function isAuthenticatedXtreamResponse(data) {
  if (!data || typeof data !== 'object') return false;
  const auth = data?.user_info?.auth;
  if (auth === 0 || auth === '0' || auth === false) return false;
  return Boolean(data.user_info);
}

async function pingHost(host, username, password) {
  const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const responseTime = Date.now() - start;
    if (!res.ok) {
      return { status: 'offline', responseTimeMs: responseTime };
    }

    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      return { status: 'offline', responseTimeMs: responseTime };
    }

    if (isAuthenticatedXtreamResponse(data)) {
      return { status: 'online', responseTimeMs: responseTime };
    }
    return { status: 'offline', responseTimeMs: responseTime };
  } catch (err) {
    clearTimeout(timer);
    return { status: 'offline', responseTimeMs: PING_TIMEOUT };
  }
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
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < PROVIDER_HEALTH_MIN_INTERVAL_MS) {
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

    await providerQueries.updateHealth(provider.id, {
      activeHost: bestHost,
      status: bestHost ? 'online' : 'offline',
    });
    await cache.del('hostHealth', provider.id);

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
    // Cache for 5 minutes
    await cache.set('hostHealth', providerId, health);
    return health;
  },
};

module.exports = hostHealthService;
