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
        customFields: {
          streamioId: user.id,
          accountStatus: user.is_active ? 'active' : 'inactive',
          lastActiveAt: user.last_seen || new Date().toISOString(),
        },
      });
      return user.twenty_person_id;
    }

    const result = await apiRequest('POST', '/people', {
      name: { firstName: user.email.split('@')[0], lastName: '' },
      emails: { primaryEmail: user.email },
      customFields: {
        streamioId: user.id,
        accountStatus: user.is_active ? 'active' : 'inactive',
        lastActiveAt: new Date().toISOString(),
      },
    });

    const personId = result?.data?.id;
    if (personId) {
      // Persist the Twenty person ID back to our DB
      const { pool } = require('../db/queries');
      await pool.query('UPDATE users SET twenty_person_id = $1 WHERE id = $2', [personId, user.id]);
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
      customFields: { lastActiveAt: lastSeen.toISOString() },
    });
  }, `updateUserActivity(${userId})`);
}

// ─── Company (IPTV Provider Partner) ─────────────────────────────────────────

async function upsertCompany(providerNetwork) {
  return withRetry(async () => {
    if (providerNetwork.twenty_company_id) {
      await apiRequest('PATCH', `/companies/${providerNetwork.twenty_company_id}`, {
        name: providerNetwork.name,
      });
      return providerNetwork.twenty_company_id;
    }

    const result = await apiRequest('POST', '/companies', {
      name: providerNetwork.name,
      domainName: { primaryLinkUrl: '', primaryLinkLabel: providerNetwork.name },
    });

    return result?.data?.id;
  }, `upsertCompany(${providerNetwork.id})`);
}

// ─── Subscription (Custom Object) ────────────────────────────────────────────

async function upsertSubscription(subscription, offeringName) {
  return withRetry(async () => {
    const payload = {
      status: subscription.status,
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
    await apiRequest('PATCH', `/subscriptions/${twentySubscriptionId}`, { status: 'cancelled' });
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
  upsertSubscription,
  cancelSubscription,
  createTask,
  createNote,
  testConnection,
  setupCustomObjects,
};
