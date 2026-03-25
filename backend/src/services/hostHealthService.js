const fetch = require('node-fetch');
const { providerQueries, hostHealthQueries } = require('../db/queries');
const logger = require('../utils/logger');

const PING_TIMEOUT = 10000; // 10s

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

    for (const provider of providers) {
      await hostHealthService.checkProvider(provider);
    }

    logger.info('Health check complete');
  },

  async checkProvider(provider) {
    let bestHost = null;
    let bestTime = Infinity;

    for (const host of provider.hosts) {
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
    return hostHealthQueries.getByProvider(providerId);
  },
};

module.exports = hostHealthService;
