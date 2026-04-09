const eventBus = require('../utils/eventBus');
const crm = require('../services/twentyCrmService');
const logger = require('../utils/logger');

async function ensureTwentyPersonId(user) {
  if (!user) return null;
  if (user.twenty_person_id) return user.twenty_person_id;
  return crm.upsertPerson(user);
}

async function ensureCompanyForProvider(provider) {
  if (!provider?.network_id) return null;
  const { providerNetworkQueries } = require('../db/queries');
  const network = await providerNetworkQueries.findById(provider.network_id);
  if (!network) return null;
  return crm.upsertCompany(network);
}

async function syncProviderAccess(provider) {
  if (!provider) return null;

  if (!provider.twenty_person_id && provider.user_id && provider.user_email) {
    const personId = await crm.upsertPerson({
      id: provider.user_id,
      email: provider.user_email,
      twenty_person_id: provider.twenty_person_id,
      is_active: true,
    });
    provider.twenty_person_id = personId;
  }

  if (provider.network_id && !provider.twenty_company_id) {
    provider.twenty_company_id = await ensureCompanyForProvider(provider);
  }

  return crm.upsertProviderAccess(provider);
}

/**
 * Register all CRM sync listeners.
 * Import once in index.js — side-effectful module.
 */

// ── user.created ──────────────────────────────────────────────────────────────
eventBus.on('user.created', async (user) => {
  const personId = await crm.upsertPerson(user);
  if (personId && !user.twenty_person_id) {
    logger.debug(`[CRM] Person created for user ${user.id}: ${personId}`);
  }
});

// ── user.updated ──────────────────────────────────────────────────────────────
eventBus.on('user.updated', async (user) => {
  await crm.upsertPerson(user);
});

// ── user.logged_in ────────────────────────────────────────────────────────────
eventBus.on('user.logged_in', async ({ userId, lastSeen }) => {
  await crm.updateUserActivity(userId, lastSeen);
});

// ── subscription.created ──────────────────────────────────────────────────────
eventBus.on('subscription.created', async ({ subscription, user, offering }) => {
  const personId = await ensureTwentyPersonId(user);

  const twentySubId = await crm.upsertSubscription(
    { ...subscription, twenty_person_id: personId },
    offering.name
  );

  if (twentySubId) {
    // Persist the Twenty subscription ID back to our DB
    const { subscriptionQueries } = require('../db/queries');
    await subscriptionQueries.update(subscription.id, { twenty_subscription_id: twentySubId });
    logger.debug(`[CRM] Subscription ${subscription.id} synced to Twenty: ${twentySubId}`);
  }
});

// ── subscription.updated ──────────────────────────────────────────────────────
eventBus.on('subscription.updated', async ({ previousSubscription, subscription }) => {
  if (!subscription.twenty_subscription_id) return;
  await crm.upsertSubscription(subscription, null);

  if (!subscription.twenty_person_id) return;

  const previousStatus = previousSubscription?.status || null;
  const nextStatus = subscription.status || null;
  const cancellationRequested =
    previousSubscription?.cancel_at_period_end !== true &&
    subscription.cancel_at_period_end === true;

  if (previousStatus !== nextStatus && nextStatus === 'past_due') {
    await crm.createNote(
      subscription.twenty_person_id,
      `Subscription entered past_due status for ${subscription.offering_name || 'marketplace plan'}.`
    );
    await crm.createTask(
      subscription.twenty_person_id,
      `Payment recovery follow-up for ${subscription.offering_name || 'subscription'}`,
      new Date()
    );
  }

  if (cancellationRequested) {
    await crm.createNote(
      subscription.twenty_person_id,
      `Customer requested cancellation at period end for ${subscription.offering_name || 'marketplace plan'}.`
    );
    await crm.createTask(
      subscription.twenty_person_id,
      `Retention follow-up for ${subscription.offering_name || 'subscription'}`,
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );
  }
});

// ── subscription.cancelled ────────────────────────────────────────────────────
eventBus.on('subscription.cancelled', async ({ subscription }) => {
  await crm.cancelSubscription(subscription.twenty_subscription_id);

  // Create a follow-up task for the churn
  if (subscription.twenty_person_id) {
    await crm.createTask(
      subscription.twenty_person_id,
      'Subscription cancelled — churn follow-up',
      new Date(Date.now() + 24 * 60 * 60 * 1000) // due tomorrow
    );
  }
});

// ── payment.succeeded ─────────────────────────────────────────────────────────
eventBus.on('payment.succeeded', async ({ user }) => {
  if (!user?.twenty_person_id) return;
  await crm.createNote(user.twenty_person_id, 'Payment succeeded');
});

// ── payment.failed ────────────────────────────────────────────────────────────
eventBus.on('payment.failed', async ({ user, failureReason }) => {
  if (!user?.twenty_person_id) return;
  await crm.createNote(user.twenty_person_id, `Payment failed: ${failureReason}`);
  await crm.createTask(
    user.twenty_person_id,
    `Urgent: payment failed — ${failureReason}`,
    new Date() // due today
  );
});

// ── provider.created / provider.updated / provider.account_updated ───────────
for (const eventName of ['provider.created', 'provider.updated', 'provider.account_updated']) {
  eventBus.on(eventName, async ({ provider }) => {
    await syncProviderAccess(provider);
  });
}

// ── provider.deleted ──────────────────────────────────────────────────────────
eventBus.on('provider.deleted', async ({ provider }) => {
  await crm.archiveProviderAccess(provider);
});

// ── provider.health_failed ────────────────────────────────────────────────────
eventBus.on('provider.health_failed', async ({ userId, twenty_person_id, providerName }) => {
  if (!twenty_person_id) return;
  await crm.createTask(
    twenty_person_id,
    `Provider health check failed: ${providerName}`,
    new Date()
  );
});

logger.info('[CRM] Listeners registered');
