const fetch = require('node-fetch');
const { providerQueries, providerNetworkQueries, hostHealthQueries } = require('../db/queries');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

const PING_TIMEOUT = 10000; // 10s
const PROVIDER_HEALTH_BATCH_SIZE = Math.max(1, parseInt(process.env.HEALTH_CHECK_BATCH_SIZE || '2', 10));
const PROVIDER_HEALTH_MIN_INTERVAL_MS = Math.max(0, parseInt(process.env.HEALTH_CHECK_PROVIDER_MIN_INTERVAL_MS || '3600000', 10));

async function pingHost(host, username, password) {
  const url = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_vod_categories`;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const responseTime = Date.now() - start;
    if (res.ok) {
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

  async checkProvider(provider) {
    const lastCheckedAt = provider.last_checked_at || provider.updated_at || null;
    if (PROVIDER_HEALTH_MIN_INTERVAL_MS > 0 && lastCheckedAt) {
      const elapsedMs = Date.now() - new Date(lastCheckedAt).getTime();
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < PROVIDER_HEALTH_MIN_INTERVAL_MS) {
        logger.info(`Skipping provider ${provider.id} health check; last checked ${elapsedMs}ms ago`);
        return;
      }
    }

    let bestHost = null;
    let bestTime = Infinity;
    const networkHosts = provider.network_id
      ? await providerNetworkQueries.listHosts(provider.network_id)
      : [];
    const hostsToCheck = networkHosts.length
      ? networkHosts.map(row => row.host_url)
      : provider.hosts;

    for (const host of hostsToCheck) {
      const result = await pingHost(host, provider.username, provider.password);
      await hostHealthQueries.upsert({
        providerId: provider.id,
        hostUrl: host,
        status: result.status,
        responseTimeMs: result.responseTimeMs,
      });

      if (result.status === 'online' && result.responseTimeMs < bestTime) {
        bestTime = result.responseTimeMs;
        bestHost = host;
      }
    }

    await providerQueries.updateHealth(provider.id, {
      activeHost: bestHost,
      status: bestHost ? 'online' : 'offline',
    });
    cache.del('hostHealth', provider.id);

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
    await hostHealthService.checkProvider(provider);
    const health = await hostHealthQueries.getByProvider(providerId);
    return health;
  },

  async getProviderHealth(providerId) {
    // Check cache first
    const cached = cache.get('hostHealth', providerId);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const health = await hostHealthQueries.getByProvider(providerId);
    // Cache for 5 minutes
    cache.set('hostHealth', providerId, health);
    return health;
  },
};

module.exports = hostHealthService;
