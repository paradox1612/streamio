const fetch = require('node-fetch');
const logger = require('../utils/logger');

const BASE_URL = process.env.TWENTY_API_URL || 'http://streambridge-twenty:3000';
const API_KEY = () => process.env.TWENTY_API_KEY || '';

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY()}`,
  };
}

function toTwentySubscriptionStatus(status) {
  if (!status) return undefined;

  const normalized = String(status).trim().toUpperCase().replace(/-/g, '_');
  if (normalized === 'CANCELED') return 'CANCELLED';
  return normalized;
}

function toProviderSourceType(isMarketplaceManaged) {
  return isMarketplaceManaged ? 'MARKETPLACE' : 'EXTERNAL';
}

function toProviderHealthStatus(status) {
  if (!status) return 'UNKNOWN';

  const normalized = String(status).trim().toUpperCase().replace(/-/g, '_');
  if (normalized === 'ONLINE') return 'ONLINE';
  if (normalized === 'OFFLINE') return 'OFFLINE';
  return 'UNKNOWN';
}

function summarizeHosts(hosts = []) {
  if (!Array.isArray(hosts) || hosts.length === 0) return '';
  return hosts.map((host) => String(host || '').trim()).filter(Boolean).join(', ');
}

// ─── Retry Helper ─────────────────────────────────────────────────────────────

async function withRetry(fn, label, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) {
        logger.error(`[TwentyCRM] ${label} failed after ${maxAttempts} attempts: ${err.message}`);
        return null; // CRM failures must never throw — never block user-facing code
      }
      const delay = 200 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ─── REST helper ──────────────────────────────────────────────────────────────

async function apiRequest(method, path, body) {
  const res = await fetch(`${BASE_URL}/rest${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twenty API ${method} ${path} → ${res.status}: ${text}`);
  }

  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
}

// ─── GraphQL helper (for Metadata API) ───────────────────────────────────────

async function metaQuery(query, variables = {}) {
  const res = await fetch(`${BASE_URL}/metadata`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twenty Metadata API → ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Twenty Metadata GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

// ─── Person (StreamBridge User) ───────────────────────────────────────────────

async function upsertPerson(user) {
  return withRetry(async () => {
    if (user.twenty_person_id) {
      await apiRequest('PATCH', `/people/${user.twenty_person_id}`, {
        name: { firstName: user.email.split('@')[0], lastName: '' },
        emails: { primaryEmail: user.email },
        streamioId: String(user.id),
        accountStatus: user.is_active ? 'ACTIVE' : 'INACTIVE',
        lastActiveAt: user.last_seen || new Date().toISOString(),
      });
      return user.twenty_person_id;
    }

    const result = await apiRequest('POST', '/people', {
      name: { firstName: user.email.split('@')[0], lastName: '' },
      emails: { primaryEmail: user.email },
      streamioId: String(user.id),
      accountStatus: user.is_active ? 'ACTIVE' : 'INACTIVE',
      lastActiveAt: new Date().toISOString(),
    });

    const personId = result?.data?.id;
    if (personId) {
      // Persist the Twenty person ID back to our DB
      const { pool } = require('../db/queries');
      await pool.query('UPDATE users SET twenty_person_id = $1 WHERE id = $2', [personId, user.id]);
      user.twenty_person_id = personId;
    }
    return personId;
  }, `upsertPerson(${user.id})`);
}

async function updateUserActivity(userId, lastSeen) {
  return withRetry(async () => {
    const { pool } = require('../db/queries');
    const { rows } = await pool.query('SELECT twenty_person_id FROM users WHERE id = $1', [userId]);
    const personId = rows[0]?.twenty_person_id;
    if (!personId) return;
    await apiRequest('PATCH', `/people/${personId}`, {
      lastActiveAt: lastSeen.toISOString(),
    });
  }, `updateUserActivity(${userId})`);
}

// ─── Company (IPTV Provider Partner) ─────────────────────────────────────────

async function upsertCompany(providerNetwork) {
  return withRetry(async () => {
    if (providerNetwork.twenty_company_id) {
      await apiRequest('PATCH', `/companies/${providerNetwork.twenty_company_id}`, {
        name: providerNetwork.name,
        streamioNetworkId: String(providerNetwork.id),
      });
      return providerNetwork.twenty_company_id;
    }

    const result = await apiRequest('POST', '/companies', {
      name: providerNetwork.name,
      domainName: { primaryLinkUrl: '', primaryLinkLabel: providerNetwork.name },
      streamioNetworkId: String(providerNetwork.id),
    });

    const companyId = result?.data?.id;
    if (companyId) {
      const { providerNetworkQueries } = require('../db/queries');
      await providerNetworkQueries.update(providerNetwork.id, { twenty_company_id: companyId });
    }
    return companyId;
  }, `upsertCompany(${providerNetwork.id})`);
}

async function upsertProviderAccess(provider) {
  return withRetry(async () => {
    const payload = {
      streamioId: String(provider.id),
      personId: provider.twenty_person_id || undefined,
      companyId: provider.twenty_company_id || undefined,
      providerName: provider.name,
      sourceType: toProviderSourceType(provider.is_marketplace_managed),
      providerStatus: toProviderHealthStatus(provider.status),
      accountStatus: provider.account_status || undefined,
      accountExpiresAt: provider.account_expires_at || undefined,
      isTrial: provider.account_is_trial ?? undefined,
      maxConnections: provider.account_max_connections ?? undefined,
      activeConnections: provider.account_active_connections ?? undefined,
      primaryHost: provider.active_host || provider.hosts?.[0] || undefined,
      hostCount: Array.isArray(provider.hosts) ? provider.hosts.length : 0,
      hostList: summarizeHosts(provider.hosts),
      networkId: provider.network_id ? String(provider.network_id) : undefined,
      networkName: provider.network_name || undefined,
      accountLastSyncedAt: provider.account_last_synced_at || undefined,
    };

    if (provider.twenty_provider_access_id) {
      await apiRequest('PATCH', `/providerAccesses/${provider.twenty_provider_access_id}`, payload);
      return provider.twenty_provider_access_id;
    }

    const result = await apiRequest('POST', '/providerAccesses', payload);
    const providerAccessId = result?.data?.id;
    if (providerAccessId) {
      const { providerQueries } = require('../db/queries');
      await providerQueries.updateCrmSync(provider.id, { twenty_provider_access_id: providerAccessId });
    }
    return providerAccessId;
  }, `upsertProviderAccess(${provider.id})`);
}

async function archiveProviderAccess(provider) {
  return withRetry(async () => {
    if (!provider?.twenty_provider_access_id) return;
    await apiRequest('PATCH', `/providerAccesses/${provider.twenty_provider_access_id}`, {
      providerStatus: 'UNKNOWN',
      accountStatus: 'REMOVED',
      accountLastSyncedAt: new Date().toISOString(),
    });
  }, `archiveProviderAccess(${provider?.id || 'unknown'})`);
}

// ─── Subscription (Custom Object) ────────────────────────────────────────────

async function upsertSubscription(subscription, offeringName) {
  return withRetry(async () => {
    const payload = {
      status: toTwentySubscriptionStatus(subscription.status),
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      stripeSubscriptionId: subscription.stripe_subscription_id,
      streamioId: subscription.id,
      personId: subscription.twenty_person_id || undefined,
    };

    if (subscription.twenty_subscription_id) {
      await apiRequest('PATCH', `/subscriptions/${subscription.twenty_subscription_id}`, payload);
      return subscription.twenty_subscription_id;
    }

    const result = await apiRequest('POST', '/subscriptions', payload);
    return result?.data?.id;
  }, `upsertSubscription(${subscription.id})`);
}

async function cancelSubscription(twentySubscriptionId) {
  return withRetry(async () => {
    if (!twentySubscriptionId) return;
    await apiRequest('PATCH', `/subscriptions/${twentySubscriptionId}`, {
      status: toTwentySubscriptionStatus('cancelled'),
    });
  }, `cancelSubscription(${twentySubscriptionId})`);
}

// ─── Tasks & Notes ────────────────────────────────────────────────────────────

async function createTask(personId, title, dueAt) {
  return withRetry(async () => {
    if (!personId) return;
    await apiRequest('POST', '/tasks', {
      title,
      dueAt: dueAt ? dueAt.toISOString() : new Date().toISOString(),
      assignees: [],
      taskTargets: [{ personId }],
    });
  }, `createTask(${personId})`);
}

async function createNote(personId, body) {
  return withRetry(async () => {
    if (!personId) return;
    await apiRequest('POST', '/notes', {
      title: 'Automated Note',
      body,
      noteTargets: [{ personId }],
    });
  }, `createNote(${personId})`);
}

// ─── List helpers (for admin UI) ─────────────────────────────────────────────

async function listPeople({ limit = 20, cursor } = {}) {
  return withRetry(async () => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('after', cursor);
    return apiRequest('GET', `/people?${params}`);
  }, 'listPeople');
}

async function listTasks({ limit = 20, cursor } = {}) {
  return withRetry(async () => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('after', cursor);
    return apiRequest('GET', `/tasks?${params}`);
  }, 'listTasks');
}

// ─── Health ───────────────────────────────────────────────────────────────────

async function testConnection() {
  try {
    const res = await fetch(`${BASE_URL}/healthz`, {
      headers: headers(),
      signal: AbortSignal.timeout(5000),
    });
    return { connected: res.ok, status: res.status };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

// ─── Schema Setup (called by twentySetupObjects.js) ───────────────────────────

async function setupCustomObjects() {
  // Create ProviderOffering custom object
  await metaQuery(`
    mutation CreateProviderOffering {
      createOneObject(input: {
        nameSingular: "providerOffering"
        namePlural: "providerOfferings"
        labelSingular: "Provider Offering"
        labelPlural: "Provider Offerings"
        description: "IPTV provider subscription plan available in the StreamBridge marketplace"
        icon: "IconShoppingCart"
      }) { id nameSingular }
    }
  `);

  // Create Subscription custom object
  await metaQuery(`
    mutation CreateSubscription {
      createOneObject(input: {
        nameSingular: "subscription"
        namePlural: "subscriptions"
        labelSingular: "Subscription"
        labelPlural: "Subscriptions"
        description: "A customer's active or historical StreamBridge subscription"
        icon: "IconReceipt"
      }) { id nameSingular }
    }
  `);

  logger.info('[TwentyCRM] Custom objects created — add fields + relations via Twenty UI or extend this script');
}

module.exports = {
  upsertPerson,
  updateUserActivity,
  upsertCompany,
  upsertProviderAccess,
  archiveProviderAccess,
  upsertSubscription,
  cancelSubscription,
  createTask,
  createNote,
  listPeople,
  listTasks,
  testConnection,
  setupCustomObjects,
};
