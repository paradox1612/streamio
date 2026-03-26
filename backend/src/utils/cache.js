const NodeCache = require('node-cache');
const logger = require('./logger');

// Create a single cache instance with standard TTLs
const cache = new NodeCache({
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
};

/**
 * Get a value from the cache.
 * @param {string} namespace - Namespace key (e.g., 'userByToken')
 * @param {string} key - Item key
 * @returns {*} Cached value or undefined
 */
function get(namespace, key) {
  const fullKey = `${namespace}:${key}`;
  const value = cache.get(fullKey);
  return value;
}

/**
 * Set a value in the cache.
 * @param {string} namespace - Namespace key
 * @param {string} key - Item key
 * @param {*} value - Value to cache
 */
function set(namespace, key, value) {
  const fullKey = `${namespace}:${key}`;
  const ttl = NAMESPACE_TTLS[namespace] || 300;
  cache.set(fullKey, value, ttl);
}

/**
 * Delete a specific key from the cache.
 * @param {string} namespace - Namespace key
 * @param {string} key - Item key
 */
function del(namespace, key) {
  const fullKey = `${namespace}:${key}`;
  cache.del(fullKey);
}

/**
 * Flush all keys in a specific namespace.
 * @param {string} namespace - Namespace key
 */
function flush(namespace) {
  const keys = cache.keys();
  const namespacedKeys = keys.filter(k => k.startsWith(`${namespace}:`));
  if (namespacedKeys.length > 0) {
    cache.del(namespacedKeys);
    logger.info(`Flushed ${namespacedKeys.length} keys from cache namespace "${namespace}"`);
  }
}

/**
 * Clear the entire cache (emergency use only).
 */
function flushAll() {
  cache.flushAll();
  logger.warn('Cache flushed entirely');
}

/**
 * Get cache stats for monitoring.
 */
function getStats() {
  return cache.getStats();
}

module.exports = {
  get,
  set,
  del,
  flush,
  flushAll,
  getStats,
};
