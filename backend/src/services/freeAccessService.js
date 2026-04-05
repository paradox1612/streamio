const { freeAccessQueries } = require('../db/queries');
const providerService = require('./providerService');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const {
  normalizeTitle,
  parseMovieTitle,
  parseSeriesTitle,
} = require('../utils/titleNormalization');

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isAccountUsable(accountInfo) {
  if (!accountInfo) return false;
  if (accountInfo.status && ['banned', 'disabled'].includes(String(accountInfo.status).toLowerCase())) {
    return false;
  }
  if (accountInfo.expiresAt && new Date(accountInfo.expiresAt).getTime() <= Date.now()) {
    return false;
  }
  if (
    Number.isFinite(accountInfo.maxConnections) &&
    Number.isFinite(accountInfo.activeConnections) &&
    accountInfo.maxConnections > 0 &&
    accountInfo.activeConnections >= accountInfo.maxConnections
  ) {
    return false;
  }
  return true;
}

function buildCapabilityState(user) {
  return {
    hasByoProviders: Boolean(user?.has_byo_providers),
    hasActiveFreeAccess: Boolean(user?.has_active_free_access),
    freeAccessStatus: user?.free_access_status || 'inactive',
    freeAccessExpiresAt: user?.free_access_expires_at || null,
    canUseLiveTv: Boolean(user?.can_use_live_tv),
    canBrowseWebCatalog: Boolean(user?.has_byo_providers || user?.has_active_free_access),
  };
}

function buildRuntimeSourceCacheKey(accountId) {
  return String(accountId);
}

function buildSourceFromCacheEntry(cacheEntry, assignment) {
  if (!cacheEntry || cacheEntry.missing) return null;

  return {
    assignment,
    providerGroup: cacheEntry.providerGroup,
    username: cacheEntry.username,
    password: cacheEntry.password,
    hosts: cacheEntry.hosts,
  };
}

async function findUsableAccountForGroup(group, account, assignment = null) {
  const cacheKey = buildRuntimeSourceCacheKey(account.id);
  const cached = cache.get('freeAccessRuntimeSource', cacheKey);
  if (cached) {
    return buildSourceFromCacheEntry(cached, assignment);
  }
  if (cache.get('freeAccessRuntimeSourceMiss', cacheKey)) {
    return null;
  }

  const hosts = await freeAccessQueries.getHostsForGroup(group.id);
  if (!hosts.length) {
    cache.set('freeAccessRuntimeSourceMiss', cacheKey, { missing: true });
    return null;
  }

  let sawCredentialFailure = false;
  let latestAccountInfo = null;

  for (const host of hosts) {
    const startedAt = Date.now();
    const result = await providerService.testConnection(host.host, account.username, account.password);
    const responseTimeMs = Date.now() - startedAt;

    await freeAccessQueries.updateHostStatus(host.id, {
      lastCheckedAt: new Date().toISOString(),
      lastStatus: result.ok ? 'online' : 'offline',
      lastResponseMs: responseTimeMs,
    });

    if (!result.ok) {
      if (/invalid credentials/i.test(String(result.error || ''))) {
        sawCredentialFailure = true;
      }
      continue;
    }

    if (!isAccountUsable(result.accountInfo)) {
      latestAccountInfo = result.accountInfo;
      continue;
    }

    const sourceHost = {
      host: {
        host: host.host,
        responseTimeMs,
      },
      accountInfo: result.accountInfo,
    };

    await freeAccessQueries.updateAccountStatus(account.id, {
      status: assignment ? 'assigned' : 'available',
      maxConnections: sourceHost.accountInfo.maxConnections,
      lastActiveConnections: sourceHost.accountInfo.activeConnections,
      lastExpirationAt: toIsoDate(sourceHost.accountInfo.expiresAt),
      lastCheckedAt: new Date().toISOString(),
    });
    cache.set('freeAccessRuntimeSource', cacheKey, {
      providerGroup: group,
      username: account.username,
      password: account.password,
      hosts: [sourceHost.host],
    });
    cache.del('freeAccessRuntimeSourceMiss', cacheKey);
    return {
      assignment,
      providerGroup: group,
      username: account.username,
      password: account.password,
      hosts: [sourceHost.host],
    };
  }

  await freeAccessQueries.updateAccountStatus(account.id, {
    status: sawCredentialFailure ? 'invalid' : account.status || 'available',
    maxConnections: latestAccountInfo?.maxConnections,
    lastActiveConnections: latestAccountInfo?.activeConnections,
    lastExpirationAt: toIsoDate(latestAccountInfo?.expiresAt),
    lastCheckedAt: new Date().toISOString(),
  });
  cache.set('freeAccessRuntimeSourceMiss', cacheKey, { missing: true });
  cache.del('freeAccessRuntimeSource', cacheKey);
  return null;
}

async function findMatchingSourceForUser(userId, matchSource) {
  const assignment = await freeAccessQueries.findActiveAssignmentForUser(userId);
  if (!assignment) return null;

  const runtimeAccounts = prioritizeRuntimeAccounts(
    await freeAccessQueries.listRuntimeEligibleAccounts(),
    assignment
  );

  if (!runtimeAccounts.length) return null;

  const attempts = runtimeAccounts.map(async (account) => {
    const group = await freeAccessQueries.findProviderGroupById(account.provider_group_id);
    if (!group || !group.is_active) {
      throw new Error('inactive_group');
    }

    const source = await findUsableAccountForGroup(group, account, assignment);
    if (!source) {
      throw new Error('no_usable_source');
    }

    const result = await matchSource(source);
    if (!result) {
      throw new Error('no_match');
    }

    return result;
  });

  try {
    return await Promise.any(attempts);
  } catch (_) {
    return null;
  }
}

function prioritizeRuntimeAccounts(accounts, assignment) {
  if (!assignment) return accounts;

  return [...accounts].sort((left, right) => {
    const leftAssigned = left.id === assignment.account_id ? 0 : 1;
    const rightAssigned = right.id === assignment.account_id ? 0 : 1;
    if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;

    const leftGroup = left.provider_group_id === assignment.provider_group_id ? 0 : 1;
    const rightGroup = right.provider_group_id === assignment.provider_group_id ? 0 : 1;
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;

    return 0;
  });
}

async function ensureCatalogFresh(providerGroupId, account) {
  const group = await freeAccessQueries.findProviderGroupById(providerGroupId);
  if (!group) return;

  const existingCount = await freeAccessQueries.getCatalogCountByGroup(providerGroupId);
  const refreshedAt = group.catalog_last_refreshed_at ? new Date(group.catalog_last_refreshed_at).getTime() : 0;
  const isFresh = refreshedAt > Date.now() - (12 * 60 * 60 * 1000);

  if (existingCount > 0 && isFresh) return;

  const hosts = await freeAccessQueries.getHostsForGroup(providerGroupId);
  let selectedHost = null;
  for (const host of hosts) {
    const result = await providerService.testConnection(host.host, account.username, account.password);
    if (result.ok && isAccountUsable(result.accountInfo)) {
      selectedHost = host.host;
      break;
    }
  }

  if (!selectedHost) {
    throw new Error(`No healthy free-access hosts available for provider group ${providerGroupId}`);
  }

  logger.info(`[FreeAccess] Refreshing catalog for group ${providerGroupId}`);
  const result = await providerService.fetchManagedCatalog(selectedHost, account.username, account.password, providerGroupId);
  await freeAccessQueries.deleteCatalogByGroup(providerGroupId);
  const entries = [...result.movies, ...result.series];
  const chunkSize = 500;
  for (let i = 0; i < entries.length; i += chunkSize) {
    await freeAccessQueries.upsertCatalogBatch(entries.slice(i, i + chunkSize));
  }
  await freeAccessQueries.setCatalogRefreshed(providerGroupId);
}

const freeAccessService = {
  buildCapabilityState,

  async getStatusForUser(userId) {
    const assignment = await freeAccessQueries.findLatestAssignmentForUser(userId);
    if (!assignment) {
      return {
        status: 'inactive',
        expiresAt: null,
        canStart: true,
        canExtend: false,
      };
    }

    const isExpired = assignment.status !== 'active' || new Date(assignment.expires_at).getTime() <= Date.now();
    return {
      status: isExpired ? 'expired' : 'active',
      expiresAt: assignment.expires_at,
      canStart: !assignment,
      canExtend: isExpired,
      startedAt: assignment.started_at,
      renewalNumber: assignment.renewal_number,
    };
  },

  async startOrExtend(userId) {
    const activeAssignment = await freeAccessQueries.findActiveAssignmentForUser(userId);
    if (activeAssignment) {
      const err = new Error('Free access is already active');
      err.status = 409;
      throw err;
    }

    const latestAssignment = await freeAccessQueries.findLatestAssignmentForUser(userId);
    if (latestAssignment && latestAssignment.status === 'active' && new Date(latestAssignment.expires_at).getTime() > Date.now()) {
      const err = new Error('Free access is already active');
      err.status = 409;
      throw err;
    }

    const eligibleAccounts = await freeAccessQueries.listRuntimeEligibleAccounts();
    for (const account of eligibleAccounts) {
      const group = await freeAccessQueries.findProviderGroupById(account.provider_group_id);
      if (!group || !group.is_active) continue;

      const usable = await findUsableAccountForGroup(group, account);
      if (!usable) continue;

      const trialDays = parseInt(group.trial_days || 7, 10);
      const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
      const renewalNumber = latestAssignment ? (latestAssignment.renewal_number || 0) + 1 : 0;

      await freeAccessQueries.updateAccountStatus(account.id, {
        status: 'assigned',
        lastAssignedAt: new Date().toISOString(),
      });

      const assignment = await freeAccessQueries.createAssignment({
        userId,
        providerGroupId: group.id,
        accountId: account.id,
        expiresAt,
        renewalNumber,
      });

      await ensureCatalogFresh(group.id, account);
      return assignment;
    }

    const err = new Error('No free access inventory is currently available');
    err.status = 503;
    throw err;
  },

  async getActiveSourcesForUser(userId) {
    const source = await this.getActiveSourceForUser(userId);
    return source ? [source] : [];
  },

  async getActiveSourceForUser(userId) {
    return findMatchingSourceForUser(userId, async (source) => source);
  },

  async resolveFallbackVodItem(userId, baseId, type) {
    return findMatchingSourceForUser(userId, async (source) => {
      let item = null;
      if (baseId.startsWith('tt')) {
        item = await freeAccessQueries.findCatalogByImdbId(source.providerGroup.id, baseId);
      } else if (baseId.startsWith('tmdb:')) {
        item = await freeAccessQueries.findCatalogByTmdbId(source.providerGroup.id, parseInt(baseId.slice(5), 10));
      }

      if (!item) return null;

      return {
        ...item,
        provider_group_id: source.providerGroup.id,
        access_source: 'free_access',
        username: source.username,
        password: source.password,
        playback_hosts: source.hosts,
        assignment_id: source.assignment.id,
      };
    });
  },

  async resolveFallbackOnDemandCandidate(userId, matcherInput) {
    const candidates = await findMatchingSourceForUser(userId, async (source) => {
      const sourceCandidates = await freeAccessQueries.findOnDemandCandidateForGroup(source.providerGroup.id, matcherInput);
      if (!Array.isArray(sourceCandidates) || sourceCandidates.length === 0) return null;

      return sourceCandidates.map(candidate => ({
        ...candidate,
        provider_group_id: source.providerGroup.id,
        access_source: 'free_access',
        username: source.username,
        password: source.password,
        playback_hosts: source.hosts,
        assignment_id: source.assignment.id,
      }));
    });

    return candidates || [];
  },

  async getCatalogForUser(userId, { page = 1, limit = 100, search = '', type, matched } = {}) {
    const assignment = await freeAccessQueries.findActiveAssignmentForUser(userId);
    if (!assignment) return [];

    return freeAccessQueries.getCatalogByAssignment(assignment, {
      page,
      limit,
      search,
      type,
      matched,
    });
  },

  async recordResolvedStream(assignmentId) {
    if (!assignmentId) return;
    await freeAccessQueries.touchAssignmentStream(assignmentId);
  },

  async expireDueAssignments() {
    const assignments = await freeAccessQueries.listExpiredActiveAssignments();
    let expired = 0;

    for (const assignment of assignments) {
      await freeAccessQueries.markAssignmentExpired(assignment.id);
      await freeAccessQueries.updateAccountStatus(assignment.account_id, {
        status: 'available',
        lastCheckedAt: new Date().toISOString(),
      });
      expired += 1;
    }

    if (expired > 0) {
      cache.flush('userByToken');
      cache.flush('manifestByToken');
    }

    return { expired };
  },

  async refreshProviderGroupCatalog(providerGroupId) {
    const group = await freeAccessQueries.findProviderGroupById(providerGroupId);
    if (!group) {
      const err = new Error('Free access provider group not found');
      err.status = 404;
      throw err;
    }

    const accounts = await freeAccessQueries.listAccountsByGroup(providerGroupId);
    for (const account of accounts) {
      const usable = await findUsableAccountForGroup(group, account);
      if (!usable) continue;
      await ensureCatalogFresh(providerGroupId, account);
      return {
        refreshed: true,
        providerGroupId,
      };
    }

    const err = new Error('No usable account available to refresh this free catalog');
    err.status = 503;
    throw err;
  },

  normalizeManagedCatalogMovie(providerGroupId, item) {
    return {
      ...parseMovieTitle(item.name || String(item.stream_id)),
      providerGroupId,
      streamId: String(item.stream_id),
      rawTitle: item.name || String(item.stream_id),
      normalizedTitle: normalizeTitle(item.name || String(item.stream_id)),
      posterUrl: item.stream_icon || null,
      category: item.category_name || 'Movies',
      vodType: 'movie',
      containerExtension: item.container_extension || 'mp4',
    };
  },

  normalizeManagedCatalogSeries(providerGroupId, item) {
    return {
      ...parseSeriesTitle(item.name || String(item.series_id)),
      providerGroupId,
      streamId: String(item.series_id),
      rawTitle: item.name || String(item.series_id),
      normalizedTitle: normalizeTitle(item.name || String(item.series_id)),
      posterUrl: item.cover || null,
      category: item.genre?.split(',')[0] || 'Series',
      vodType: 'series',
      containerExtension: null,
    };
  },
};

module.exports = freeAccessService;
