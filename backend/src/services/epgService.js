const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');
const { providerQueries } = require('../db/queries');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

const FETCH_TIMEOUT = 30000; // 30s for EPG downloads (can be large files)

/**
 * Parse XMLTV datetime format: "20260324180000 +0000"
 * Returns a Date object in UTC.
 */
function parseXmltvDate(dateStr) {
  if (!dateStr) return null;
  // Format: YYYYMMDDHHmmss +TZTZ
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    )
  );
  return date;
}

/**
 * Fetch and parse XMLTV EPG data from a provider.
 * Returns a Map of channelId → { now, next }
 * where now and next are programme objects with title, start, stop.
 */
async function fetchEpg(host, username, password) {
  const url = `${host}/xmltv.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const xmlText = await res.text();

    // Parse XML with fast-xml-parser
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const parsed = parser.parse(xmlText);
    const tv = parsed?.tv || {};
    const programmes = Array.isArray(tv.programme) ? tv.programme : tv.programme ? [tv.programme] : [];

    // Build EPG map: channelId → sorted list of programmes
    const channelMap = new Map();

    for (const prog of programmes) {
      if (!prog?.['@_channel']) continue;

      const channelId = prog['@_channel'];
      const startTime = parseXmltvDate(prog['@_start']);
      const stopTime = parseXmltvDate(prog['@_stop']);

      if (!startTime) continue;

      const title = typeof prog.title === 'string'
        ? prog.title
        : Array.isArray(prog.title)
        ? prog.title[0]
        : '';

      const programme = {
        title: title || 'Unknown',
        start: startTime,
        stop: stopTime,
      };

      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, []);
      }

      channelMap.get(channelId).push(programme);
    }

    // Sort programmes by start time and compute now/next for each channel
    const epgMap = new Map();
    const now = new Date();

    for (const [channelId, programmes] of channelMap.entries()) {
      // Sort by start time
      programmes.sort((a, b) => a.start.getTime() - b.start.getTime());

      // Find current and next programme
      let nowProg = null;
      let nextProg = null;

      for (const prog of programmes) {
        const isAiring = prog.start <= now && (!prog.stop || prog.stop > now);
        if (isAiring) {
          nowProg = prog;
        } else if (!nowProg && prog.start > now) {
          nextProg = prog;
          break;
        } else if (nowProg && prog.start > now) {
          nextProg = prog;
          break;
        }
      }

      epgMap.set(channelId, { now: nowProg, next: nextProg });
    }

    logger.info(`Fetched EPG for ${epgMap.size} channels`);
    return epgMap;
  } catch (err) {
    clearTimeout(timer);
    logger.warn(`EPG fetch failed: ${err.message}`);
    throw err;
  }
}

/**
 * Get EPG data for a provider (with caching).
 * Looks up the provider, fetches EPG, and caches for 4 hours.
 */
async function getEpgForProvider(providerId, userId) {
  // Check cache first
  const cached = await cache.get('epg', providerId);
  if (cached) {
    logger.info(`EPG cache hit for provider ${providerId}`);
    return cached;
  }

  const provider = await providerQueries.findByIdAndUser(providerId, userId);
  if (!provider) {
    throw Object.assign(new Error('Provider not found'), { status: 404 });
  }

  const host = provider.active_host || provider.hosts[0];
  if (!host) {
    throw new Error('No host available for EPG fetch');
  }

  try {
    const epgMap = await fetchEpg(host, provider.username, provider.password);
    // Cache for 4 hours
    await cache.set('epg', providerId, epgMap);
    return epgMap;
  } catch (err) {
    logger.warn(`Failed to fetch EPG for provider ${providerId}: ${err.message}`);
    throw err;
  }
}

/**
 * Helper to get current and next programme for a channel from an EPG map.
 */
function getCurrentProgramme(epgMap, epgChannelId) {
  if (!epgMap || !epgChannelId) return null;
  return epgMap.get(epgChannelId) || null;
}

/**
 * Refresh EPG for all online providers (pre-warms cache).
 * Called by the scheduler job.
 */
async function refreshAllProviders() {
  logger.info('Starting EPG refresh for all providers...');

  const providers = await providerQueries.getAllForHealthCheck();
  let refreshed = 0;
  let failed = 0;

  for (const provider of providers) {
    if (provider.status !== 'online') {
      logger.debug(`Skipping offline provider: ${provider.name}`);
      continue;
    }

    try {
      const host = provider.active_host || provider.hosts[0];
      if (!host) continue;

      const epgMap = await fetchEpg(host, provider.username, provider.password);
      await cache.set('epg', provider.id, epgMap);
      refreshed++;
      logger.info(`EPG refreshed for provider: ${provider.name}`);
    } catch (err) {
      failed++;
      logger.warn(`EPG refresh failed for provider ${provider.id}: ${err.message}`);
    }
  }

  logger.info(`EPG refresh complete: ${refreshed} succeeded, ${failed} failed`);
}

module.exports = {
  fetchEpg,
  getEpgForProvider,
  getCurrentProgramme,
  refreshAllProviders,
};
