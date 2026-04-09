const eventBus = require('../utils/eventBus');
const crm = require('../services/twentyCrmService');
const logger = require('../utils/logger');

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
  await crm.upsertPerson(user);

  const twentySubId = await crm.upsertSubscription(
    { ...subscription, twenty_person_id: user.twenty_person_id },
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
eventBus.on('subscription.updated', async ({ subscription }) => {
  if (!subscription.twenty_subscription_id) return;
  await crm.upsertSubscription(subscription, null);
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
