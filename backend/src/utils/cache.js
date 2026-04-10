const NodeCache = require('node-cache');
const Redis = require('ioredis');
const logger = require('./logger');

const REDIS_URL = process.env.REDIS_URL;
let redis = null;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
    redis.on('error', (err) => logger.error('[Cache] Redis error:', err));
    redis.on('connect', () => logger.info('[Cache] Redis connected'));
    logger.info(`[Cache] Using Redis at ${REDIS_URL.replace(/:[^:]+@/, ':****@')}`);
  } catch (err) {
    logger.error('[Cache] Failed to initialize Redis:', err);
  }
}

// Fallback in-memory cache
const localCache = new NodeCache({
  stdTTL: 300, // 5 min default TTL
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false, // Don't clone values (performance)
});

// Named TTL configurations (in seconds)
const NAMESPACE_TTLS = {
  userByToken: 300, // 5 min
  providerById: 300, // 5 min
  providerAccountInfo: 300, // 5 min
  userActivityTouch: 3600, // 1 hour
  seriesEpisodes: 600, // 10 min
  manifestByToken: 60, // 1 min
  hostHealth: 300, // 5 min
  epg: 14400, // 4 hours
  resolvedVodLookup: 60, // 1 min
  resolvedVodLookupMiss: 15, // 15 sec
  resolvedMeta: 30, // 30 sec
  resolvedMetaMiss: 15, // 15 sec
  resolvedStreams: 20, // 20 sec
  resolvedStreamsMiss: 10, // 10 sec
  providerHostRecheck: 90, // 90 sec
  freeAccessRuntimeSource: 20, // 20 sec
  freeAccessRuntimeSourceMiss: 10, // 10 sec
  tmdbTrending: 21600, // 6 hours
};

/**
 * Get a value from the cache.
 * @param {string} namespace - Namespace key
 * @param {string} key - Item key
 * @returns {Promise<*>} Cached value or undefined
 */
async function get(namespace, key) {
  const fullKey = `cache:${namespace}:${key}`;
  
  if (redis) {
    try {
      const val = await redis.get(fullKey);
      if (!val) return undefined;
      return JSON.parse(val);
    } catch (err) {
      logger.error(`[Cache] Redis get error for ${fullKey}:`, err);
      return undefined;
    }
  }
  
  return localCache.get(fullKey);
}

/**
 * Set a value in the cache.
 * @param {string} namespace - Namespace key
 * @param {string} key - Item key
 * @param {*} value - Value to cache
 * @param {number} [ttlOverride] - Optional TTL in seconds
 * @returns {Promise<void>}
 */
async function set(namespace, key, value, ttlOverride) {
  const fullKey = `cache:${namespace}:${key}`;
  const ttl = Number.isFinite(ttlOverride) ? ttlOverride : (NAMESPACE_TTLS[namespace] || 300);
  
  if (redis) {
    try {
      await redis.set(fullKey, JSON.stringify(value), 'EX', ttl);
      return;
    } catch (err) {
      logger.error(`[Cache] Redis set error for ${fullKey}:`, err);
    }
  }
  
  localCache.set(fullKey, value, ttl);
}

/**
 * Delete a specific key from the cache.
 * @param {string} namespace - Namespace key
 * @param {string} key - Item key
 * @returns {Promise<void>}
 */
async function del(namespace, key) {
  const fullKey = `cache:${namespace}:${key}`;
  
  if (redis) {
    try {
      await redis.del(fullKey);
      return;
    } catch (err) {
      logger.error(`[Cache] Redis del error for ${fullKey}:`, err);
    }
  }
  
  localCache.del(fullKey);
}

/**
 * Flush all keys in a specific namespace.
 * @param {string} namespace - Namespace key
 * @returns {Promise<void>}
 */
async function flush(namespace) {
  if (redis) {
    try {
      const stream = redis.scanStream({ match: `cache:${namespace}:*` });
      stream.on('data', async (keys) => {
        if (keys.length) {
          const pipeline = redis.pipeline();
          keys.forEach(k => pipeline.del(k));
          await pipeline.exec();
        }
      });
      return;
    } catch (err) {
      logger.error(`[Cache] Redis flush error for namespace ${namespace}:`, err);
    }
  }

  const keys = localCache.keys();
  const namespacedKeys = keys.filter(k => k.startsWith(`cache:${namespace}:`));
  if (namespacedKeys.length > 0) {
    localCache.del(namespacedKeys);
    logger.info(`Flushed ${namespacedKeys.length} keys from cache namespace "${namespace}"`);
  }
}

/**
 * Clear the entire cache (emergency use only).
 * @returns {Promise<void>}
 */
async function flushAll() {
  if (redis) {
    try {
      await redis.flushdb();
      logger.warn('[Cache] Redis flushed entirely');
      return;
    } catch (err) {
      logger.error('[Cache] Redis flushAll error:', err);
    }
  }
  
  localCache.flushAll();
  logger.warn('[Cache] Local cache flushed entirely');
}

/**
 * Get cache stats for monitoring.
 */
function getStats() {
  if (redis) {
    return { type: 'redis', status: redis.status };
  }
  return { type: 'local', ...localCache.getStats() };
}

module.exports = {
  get,
  set,
  del,
  flush,
  flushAll,
  getStats,
};
