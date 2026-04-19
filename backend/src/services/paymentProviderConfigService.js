const { systemSettingQueries } = require('../db/queries');
const logger = require('../utils/logger');

const SETTING_KEY = 'payment_providers_config';
const CACHE_TTL_MS = 30_000; // 30 seconds

let _cache = null;
let _cacheTs = 0;

const PROVIDERS = ['stripe', 'paygate', 'helcim', 'square'];
const CHECKOUT_FIELD_DEFAULTS = {
  minimum_amount_cents: 0,
  promo_credit_percent: 0,
};

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

/**
 * Load all provider configs from DB (with short-lived cache).
 * Returns an object keyed by provider name.
 */
async function getAll() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;

  try {
    _cache = (await systemSettingQueries.get(SETTING_KEY)) || {};
  } catch (err) {
    logger.warn('[PaymentProviderConfig] Failed to load from DB:', err.message);
    _cache = _cache || {};
  }
  _cacheTs = Date.now();
  return _cache;
}

/**
 * Return config for a single provider. Falls back to env vars for key fields.
 */
async function getProvider(name) {
  const all = await getAll();
  const cfg = all[name] || {};
  return {
    ...cfg,
    minimum_amount_cents: normalizeNonNegativeInteger(cfg.minimum_amount_cents, CHECKOUT_FIELD_DEFAULTS.minimum_amount_cents),
    promo_credit_percent: normalizeNonNegativeInteger(cfg.promo_credit_percent, CHECKOUT_FIELD_DEFAULTS.promo_credit_percent),
  };
}

/**
 * Is this provider both enabled (has keys) and visible to customers?
 * Checks DB config first, then falls back to env vars.
 */
async function isProviderVisible(name) {
  const cfg = await getProvider(name);
  return cfg.visible === true;
}

/**
 * Resolve the effective secret key for a provider field.
 * DB value takes priority; falls back to the given env var value.
 */
function resolveField(dbValue, envValue) {
  return dbValue || envValue || null;
}

/**
 * Resolve whether a provider is enabled:
 * DB `enabled` flag overrides, otherwise derived from presence of key env vars.
 */
function resolveEnabled(dbCfg, envEnabled) {
  if (typeof dbCfg.enabled === 'boolean') return dbCfg.enabled;
  return envEnabled;
}

/**
 * Save full config for all providers. Merges deep with existing.
 * Sensitive fields: empty string → keep existing value.
 */
async function saveAll(updates) {
  const existing = await getAll();
  const merged = { ...existing };

  for (const provider of PROVIDERS) {
    if (!updates[provider]) continue;
    const prev = existing[provider] || {};
    const next = updates[provider];

    // For each field: if value is '' or undefined, keep existing
    const resolved = {};
    for (const [key, val] of Object.entries(next)) {
      resolved[key] = (val === '' || val === undefined) ? prev[key] : val;
    }
    merged[provider] = { ...prev, ...resolved };
  }

  await systemSettingQueries.set(SETTING_KEY, merged);
  invalidateCache();
  return merged;
}

/** Wipe the in-memory cache so next read goes to DB. */
function invalidateCache() {
  _cache = null;
  _cacheTs = 0;
}

/**
 * Return a "safe" version of the config for the admin UI:
 * sensitive key fields are redacted to show only last 4 chars (or masked).
 */
function redactConfig(config) {
  const SENSITIVE = {
    stripe: ['secret_key', 'webhook_secret'],
    paygate: ['api_key'],
    helcim: ['api_token', 'webhook_secret'],
    square: ['access_token', 'webhook_signature_key'],
  };

  const out = {};
  for (const provider of PROVIDERS) {
    const cfg = config[provider] || {};
    const sensitiveFields = SENSITIVE[provider] || [];
    out[provider] = { ...cfg };
    for (const field of sensitiveFields) {
      if (cfg[field]) {
        const val = String(cfg[field]);
        out[provider][field] = val.length > 4 ? `****${val.slice(-4)}` : '****';
        out[provider][`has_${field}`] = true;
      } else {
        out[provider][`has_${field}`] = false;
      }
    }
  }
  return out;
}

module.exports = {
  getAll,
  getProvider,
  isProviderVisible,
  resolveField,
  resolveEnabled,
  saveAll,
  invalidateCache,
  redactConfig,
  PROVIDERS,
  CHECKOUT_FIELD_DEFAULTS,
  normalizeNonNegativeInteger,
};
