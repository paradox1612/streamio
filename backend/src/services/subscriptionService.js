const { pool, offeringQueries, subscriptionQueries, paymentQueries, providerNetworkQueries, providerQueries, freeAccessQueries } = require('../db/queries');
const logger = require('../utils/logger');
const eventBus = require('../utils/eventBus');

/**
 * Called when checkout.session.completed fires.
 * Creates the provider_subscriptions row and provisions user_providers credentials.
 */
async function handlePurchase({ stripeSession, stripeSubscription }) {
  const { streamio_user_id: userId, streamio_offering_id: offeringId } =
    stripeSession.metadata || {};

  if (!userId || !offeringId) {
    logger.warn('[SubscriptionService] Missing metadata on checkout session — skipping provision');
    return;
  }

  // Fetch user
  const { rows: userRows } = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  const user = userRows[0];
  if (!user) {
    logger.error(`[SubscriptionService] User ${userId} not found`);
    return;
  }

  const offering = await offeringQueries.findById(offeringId);
  if (!offering) {
    logger.error(`[SubscriptionService] Offering ${offeringId} not found`);
    return;
  }

  // Persist subscription record
  const sub = await subscriptionQueries.create({
    user_id: userId,
    offering_id: offeringId,
    stripe_customer_id: stripeSubscription.customer,
    stripe_subscription_id: stripeSubscription.id,
    status: stripeSubscription.status,
    current_period_start: stripeSubscription.current_period_start
      ? new Date(stripeSubscription.current_period_start * 1000)
      : null,
    current_period_end: stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000)
      : null,
    trial_end: stripeSubscription.trial_end
      ? new Date(stripeSubscription.trial_end * 1000)
      : null,
  });

  // Provision IPTV credentials if linked to a provider network
  let userProvider = null;
  if (offering.provider_network_id) {
    try {
      userProvider = await provisionCredentials(userId, offering);
      if (userProvider) {
        await subscriptionQueries.update(sub.id, { user_provider_id: userProvider.id });
        sub.user_provider_id = userProvider.id;
      }
    } catch (err) {
      logger.error(`[SubscriptionService] Credential provisioning failed: ${err.message}`);
    }
  }

  // Emit event for CRM sync (fire and forget)
  eventBus.emit('subscription.created', { subscription: { ...sub, twenty_person_id: user.twenty_person_id }, user, offering });

  logger.info(`[SubscriptionService] Subscription ${sub.id} created for user ${userId}`);
  return sub;
}

/**
 * Provision IPTV provider credentials from free_access_provider_accounts
 * or the provider_network_hosts pool.
 */
async function provisionCredentials(userId, offering) {
  // Find an available account in the free_access pool linked to this network
  const { rows: accountRows } = await pool.query(
    `SELECT a.*
     FROM free_access_provider_accounts a
     JOIN free_access_provider_groups g ON g.id = a.provider_group_id
     WHERE g.provider_network_id = $1
       AND a.status = 'available'
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [offering.provider_network_id]
  );

  const account = accountRows[0];
  if (!account) {
    logger.warn(`[SubscriptionService] No available accounts for network ${offering.provider_network_id}`);
    return null;
  }

  // Fetch the network hosts
  const hosts = await providerNetworkQueries.listHosts(offering.provider_network_id);
  if (!hosts.length) {
    logger.warn(`[SubscriptionService] No hosts for network ${offering.provider_network_id}`);
    return null;
  }

  const hostUrls = hosts.map((h) => h.host_url);

  // Create user_providers row
  const userProvider = await providerQueries.create({
    userId,
    name: offering.name,
    hosts: hostUrls,
    username: account.username,
    password: account.password,
    networkId: offering.provider_network_id,
  });

  // Mark account as in-use
  await pool.query(
    `UPDATE free_access_provider_accounts SET status = 'in_use' WHERE id = $1`,
    [account.id]
  );

  return userProvider;
}

/**
 * Called when customer.subscription.updated fires.
 */
async function handleSubscriptionUpdated(stripeSubscription) {
  const previous = await subscriptionQueries.findByStripeSubscriptionId(stripeSubscription.id);

  const updated = await subscriptionQueries.updateByStripeId(stripeSubscription.id, {
    status: stripeSubscription.status,
    current_period_start: stripeSubscription.current_period_start
      ? new Date(stripeSubscription.current_period_start * 1000)
      : null,
    current_period_end: stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000)
      : null,
    cancel_at_period_end: stripeSubscription.cancel_at_period_end,
    trial_end: stripeSubscription.trial_end
      ? new Date(stripeSubscription.trial_end * 1000)
      : null,
  });

  if (updated) {
    eventBus.emit('subscription.updated', { previousSubscription: previous, subscription: updated });
  }
}

/**
 * Called when customer.subscription.deleted fires.
 */
async function handleSubscriptionCancelled(stripeSubscription) {
  const updated = await subscriptionQueries.updateByStripeId(stripeSubscription.id, {
    status: 'cancelled',
    cancelled_at: new Date(),
  });

  if (!updated) return;

  // Revoke provider access
  if (updated.user_provider_id) {
    try {
      await providerQueries.delete(updated.user_provider_id);
    } catch (err) {
      logger.error(`[SubscriptionService] Failed to revoke user_provider ${updated.user_provider_id}: ${err.message}`);
    }
  }

  eventBus.emit('subscription.cancelled', { subscription: updated });
}

/**
 * Called when invoice.payment_succeeded fires.
 */
async function handlePaymentSucceeded(invoice) {
  const sub = await subscriptionQueries.findByStripeSubscriptionId(invoice.subscription);

  await paymentQueries.insert({
    user_id: sub?.user_id,
    subscription_id: sub?.id,
    amount_cents: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    stripe_payment_intent_id: invoice.payment_intent,
    stripe_invoice_id: invoice.id,
  });

  if (sub) {
    eventBus.emit('payment.succeeded', { user: { id: sub.user_id, twenty_person_id: sub.twenty_person_id }, subscription: sub });
  }
}

/**
 * Called when invoice.payment_failed fires.
 */
async function handlePaymentFailed(invoice) {
  const sub = await subscriptionQueries.findByStripeSubscriptionId(invoice.subscription);

  await paymentQueries.insert({
    user_id: sub?.user_id,
    subscription_id: sub?.id,
    amount_cents: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    stripe_payment_intent_id: invoice.payment_intent,
    stripe_invoice_id: invoice.id,
    failure_reason: invoice.last_payment_error?.message || null,
  });

  if (sub) {
    const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [sub.user_id]);
    eventBus.emit('payment.failed', {
      user: userRows[0] || { id: sub.user_id, twenty_person_id: sub.twenty_person_id },
      subscription: sub,
      failureReason: invoice.last_payment_error?.message || 'Payment failed',
    });
  }
}

module.exports = {
  handlePurchase,
  handleSubscriptionUpdated,
  handleSubscriptionCancelled,
  handlePaymentSucceeded,
  handlePaymentFailed,
  // Exported for use by PayGate/credits checkout paths
  provisionCredentialsPublic: provisionCredentials,
};
