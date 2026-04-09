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

const PROVIDER_EXPIRY_TASK_PREFIX = 'Provider expiry risk';

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeValue(value).toLowerCase();
}

async function listAllRecords(path, dataKey, { limit = 100, maxPages = 50 } = {}) {
  const records = [];
  let cursor;
  let page = 0;

  while (page < maxPages) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('after', cursor);

    const result = await apiRequest('GET', `${path}?${params.toString()}`);
    records.push(...(result?.data?.[dataKey] || []));

    if (!result?.pageInfo?.hasNextPage || !result?.pageInfo?.endCursor) break;
    cursor = result.pageInfo.endCursor;
    page += 1;
  }

  return records;
}

function isoOrNow(value) {
  return value || new Date().toISOString();
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function differenceInDays(targetDate, baseDate = new Date()) {
  const target = new Date(targetDate);
  if (Number.isNaN(target.getTime())) return null;
  const diff = target.getTime() - baseDate.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function getProviderExpiryTaskTitle(providerName, daysUntilExpiry) {
  const safeName = normalizeValue(providerName) || 'provider';
  return `${PROVIDER_EXPIRY_TASK_PREFIX}: ${safeName} expires in ${daysUntilExpiry} days`;
}

async function persistPersonId(userId, personId) {
  if (!userId || !personId) return;
  const { pool } = require('../db/queries');
  await pool.query('UPDATE users SET twenty_person_id = $1 WHERE id = $2', [personId, userId]);
}

async function persistCompanyId(networkId, companyId) {
  if (!networkId || !companyId) return;
  const { providerNetworkQueries } = require('../db/queries');
  await providerNetworkQueries.update(networkId, { twenty_company_id: companyId });
}

async function persistProviderAccessId(providerId, providerAccessId) {
  if (!providerId || !providerAccessId) return;
  const { providerQueries } = require('../db/queries');
  await providerQueries.updateCrmSync(providerId, { twenty_provider_access_id: providerAccessId });
}

async function findExistingPerson(user) {
  const people = await listAllRecords('/people', 'people');
  const streamioId = normalizeValue(user.id);
  const email = normalizeEmail(user.email);

  return people.find((person) => normalizeValue(person.streamioId) === streamioId)
    || people.find((person) => normalizeEmail(person?.emails?.primaryEmail) === email)
    || null;
}

async function findExistingCompany(providerNetwork) {
  const companies = await listAllRecords('/companies', 'companies');
  const streamioNetworkId = normalizeValue(providerNetwork.id);
  const networkName = normalizeValue(providerNetwork.name);

  return companies.find((company) => normalizeValue(company.streamioNetworkId) === streamioNetworkId)
    || companies.find((company) => normalizeValue(company.name) === networkName)
    || null;
}

async function findExistingProviderAccess(provider) {
  const providerAccesses = await listAllRecords('/providerAccesses', 'providerAccesses');
  const streamioId = normalizeValue(provider.id);

  return providerAccesses.find((providerAccess) => normalizeValue(providerAccess.streamioId) === streamioId)
    || null;
}

async function findExistingTaskByTitle(title) {
  const tasks = await listAllRecords('/tasks', 'tasks');
  return tasks.find((task) => normalizeValue(task.title) === normalizeValue(title)) || null;
}

async function createWithDuplicateFallback(path, body, resolveExisting) {
  try {
    return await apiRequest('POST', path, body);
  } catch (err) {
    const duplicateDetected = /duplicate entry/i.test(err.message);
    if (!duplicateDetected) throw err;

    const existing = await resolveExisting();
    if (existing?.id) {
      return { data: { id: existing.id } };
    }

    throw err;
  }
}

function stripProviderRelationFields(payload) {
  const nextPayload = { ...payload };
  delete nextPayload.personRecordId;
  delete nextPayload.companyRecordId;
  return nextPayload;
}

function isUnknownFieldError(err, fieldName) {
  return err?.message?.includes(fieldName) || false;
}

async function upsertProviderAccessRecord(path, payload, resolveExisting) {
  try {
    if (path.includes('/providerAccesses/')) {
      await apiRequest('PATCH', path, payload);
      return null;
    }
    return await createWithDuplicateFallback(path, payload, resolveExisting);
  } catch (err) {
    const relationFieldMissing =
      isUnknownFieldError(err, 'personRecordId') ||
      isUnknownFieldError(err, 'companyRecordId');

    if (!relationFieldMissing) throw err;

    const fallbackPayload = stripProviderRelationFields(payload);
    if (path.includes('/providerAccesses/')) {
      await apiRequest('PATCH', path, fallbackPayload);
      return null;
    }
    return createWithDuplicateFallback(path, fallbackPayload, resolveExisting);
  }
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
    const payload = {
      name: { firstName: user.email.split('@')[0], lastName: '' },
      emails: { primaryEmail: user.email },
      streamioId: String(user.id),
      accountStatus: user.is_active ? 'ACTIVE' : 'INACTIVE',
      lastActiveAt: isoOrNow(user.last_seen),
    };

    let personId = user.twenty_person_id;
    if (!personId) {
      const existing = await findExistingPerson(user);
      personId = existing?.id || null;
    }

    if (personId) {
      await apiRequest('PATCH', `/people/${personId}`, payload);
      if (user.twenty_person_id !== personId) {
        await persistPersonId(user.id, personId);
        user.twenty_person_id = personId;
      }
      return personId;
    }

    const result = await createWithDuplicateFallback('/people', payload, () => findExistingPerson(user));
    personId = result?.data?.id;
    if (personId) {
      await persistPersonId(user.id, personId);
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
    const payload = {
      name: providerNetwork.name,
      domainName: { primaryLinkUrl: '', primaryLinkLabel: providerNetwork.name },
      streamioNetworkId: String(providerNetwork.id),
    };

    let companyId = providerNetwork.twenty_company_id;
    if (!companyId) {
      const existing = await findExistingCompany(providerNetwork);
      companyId = existing?.id || null;
    }

    if (companyId) {
      await apiRequest('PATCH', `/companies/${companyId}`, payload);
      if (providerNetwork.twenty_company_id !== companyId) {
        await persistCompanyId(providerNetwork.id, companyId);
        providerNetwork.twenty_company_id = companyId;
      }
      return companyId;
    }

    const result = await createWithDuplicateFallback('/companies', payload, () => findExistingCompany(providerNetwork));
    companyId = result?.data?.id;
    if (companyId) {
      await persistCompanyId(providerNetwork.id, companyId);
      providerNetwork.twenty_company_id = companyId;
    }
    return companyId;
  }, `upsertCompany(${providerNetwork.id})`);
}

async function upsertProviderAccess(provider) {
  return withRetry(async () => {
    const payload = {
      name: provider.name,
      streamioId: String(provider.id),
      personId: provider.twenty_person_id || undefined,
      companyId: provider.twenty_company_id || undefined,
      personRecordId: provider.twenty_person_id || undefined,
      companyRecordId: provider.twenty_company_id || undefined,
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

    let providerAccessId = provider.twenty_provider_access_id;
    if (!providerAccessId) {
      const existing = await findExistingProviderAccess(provider);
      providerAccessId = existing?.id || null;
    }

    if (providerAccessId) {
      await upsertProviderAccessRecord(`/providerAccesses/${providerAccessId}`, payload, () => findExistingProviderAccess(provider));
      if (provider.twenty_provider_access_id !== providerAccessId) {
        await persistProviderAccessId(provider.id, providerAccessId);
        provider.twenty_provider_access_id = providerAccessId;
      }
      return providerAccessId;
    }

    const result = await upsertProviderAccessRecord('/providerAccesses', payload, () => findExistingProviderAccess(provider));
    providerAccessId = result?.data?.id;
    if (providerAccessId) {
      await persistProviderAccessId(provider.id, providerAccessId);
      provider.twenty_provider_access_id = providerAccessId;
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
      personRecordId: personId,
    });
  }, `createTask(${personId})`);
}

async function createTaskIfMissing(personId, title, dueAt) {
  return withRetry(async () => {
    if (!personId || !title) return null;

    const existing = await findExistingTaskByTitle(title);
    if (existing?.id) return existing.id;

    const result = await apiRequest('POST', '/tasks', {
      title,
      dueAt: dueAt ? dueAt.toISOString() : new Date().toISOString(),
      personRecordId: personId,
    });
    return result?.data?.id || null;
  }, `createTaskIfMissing(${personId}, ${title})`);
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

async function ensureProviderExpiryTask(provider) {
  return withRetry(async () => {
    const personId = provider?.twenty_person_id;
    const expiresAt = normalizeTimestamp(provider?.account_expires_at);
    if (!personId || !expiresAt) return null;

    const daysUntilExpiry = differenceInDays(expiresAt);
    if (daysUntilExpiry === null || daysUntilExpiry < 0 || daysUntilExpiry > 3) return null;

    const dueAt = new Date(expiresAt);
    const title = getProviderExpiryTaskTitle(provider.name, daysUntilExpiry);
    return createTaskIfMissing(personId, title, dueAt);
  }, `ensureProviderExpiryTask(${provider?.id || 'unknown'})`);
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
  createTaskIfMissing,
  createNote,
  listPeople,
  listTasks,
  ensureProviderExpiryTask,
  testConnection,
  setupCustomObjects,
  metaQuery,
};
