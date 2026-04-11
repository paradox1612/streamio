const crypto = require('crypto');
const { pool, offeringQueries, subscriptionQueries, paymentQueries, providerNetworkQueries, providerQueries, freeAccessQueries } = require('../db/queries');
const logger = require('../utils/logger');
const eventBus = require('../utils/eventBus');
const providerService = require('./providerService');
const xtreamUiScraper = require('../utils/xtreamUiScraper');
const { resolveSelectedPlan } = require('../utils/marketplacePlans');

function sanitizeTokenPart(value, fallback = 'user') {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return cleaned || fallback;
}

function buildMarketplaceLineUsername(user, offering) {
  const emailPart = sanitizeTokenPart(String(user.email || '').split('@')[0], 'user').slice(0, 8);
  const offeringPart = sanitizeTokenPart(offering.name, 'line').slice(0, 6);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${offeringPart}${emailPart}${suffix}`.slice(0, 24);
}

function buildMarketplaceLinePassword() {
  return crypto.randomBytes(8).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
}

async function ensureManagedNetworkSession(network, panelHost) {
  if (!network.xtream_ui_scraped) return null;
  if (!panelHost) throw new Error('No reseller portal URL or customer hosts configured');

  const tryRefresh = async () => {
    if (!network.reseller_username || !network.reseller_password) {
      throw new Error('Reseller username and password required for auto-login');
    }
    const session = await xtreamUiScraper.autoLogin(
      panelHost,
      network.reseller_username,
      network.reseller_password
    );
    await providerNetworkQueries.update(network.id, { reseller_session_cookie: session });
    network.reseller_session_cookie = session;
    return session;
  };

  if (!network.reseller_session_cookie) {
    return tryRefresh();
  }

  const isValid = await xtreamUiScraper.isSessionValid(panelHost, network.reseller_session_cookie);
  if (isValid) return network.reseller_session_cookie;

  logger.info(`[SubscriptionService] Refreshing stale reseller session for network ${network.id}`);
  return tryRefresh();
}

/**
 * Called when checkout.session.completed fires.
 * Creates the provider_subscriptions row and provisions user_providers credentials.
 */
async function handlePurchase({ stripeSession, stripeSubscription }) {
  const { streamio_user_id: userId, streamio_offering_id: offeringId } =
    stripeSession.metadata || {};
  const autoRenew = (stripeSession.metadata?.streamio_auto_renew || 'true') !== 'false';

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
  const selectedPlan = resolveSelectedPlan(offering, stripeSession.metadata?.streamio_plan_code);

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
    auto_renew: autoRenew,
    selected_plan_code: selectedPlan.code,
    selected_plan_name: selectedPlan.name,
    selected_price_cents: selectedPlan.price_cents,
    selected_currency: selectedPlan.currency,
    selected_billing_period: selectedPlan.billing_period,
    selected_interval_count: selectedPlan.billing_interval_count,
  });

  // Provision IPTV credentials if linked to a provider network
  let userProvider = null;
  if (offering.provider_network_id) {
    try {
      userProvider = await provisionCredentials(userId, offering, {
        user,
        expiresAt: sub.current_period_end,
        subscriptionId: sub.id,
        selectedPlan,
      });
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

  if (!autoRenew && stripeSubscription.id) {
    try {
      const stripeService = require('./stripeService');
      await stripeService.cancelSubscription(stripeSubscription.id);
      await subscriptionQueries.update(sub.id, { cancel_at_period_end: true, auto_renew: false });
    } catch (err) {
      logger.error(`[SubscriptionService] Failed to disable auto-renew for ${sub.id}: ${err.message}`);
    }
  }

  logger.info(`[SubscriptionService] Subscription ${sub.id} created for user ${userId}`);
  return sub;
}

/**
 * Provision IPTV provider credentials from free_access_provider_accounts
 * or the provider_network_hosts pool.
 */
async function provisionCredentials(userId, offering, { user = null, expiresAt = null, selectedPlan = null } = {}) {
  const provisioningMode = offering.provisioning_mode || 'pooled_account';

  if (provisioningMode === 'reseller_line') {
    return provisionManagedResellerLine(userId, offering, { user, expiresAt, selectedPlan });
  }

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

async function provisionManagedResellerLine(userId, offering, { user = null, expiresAt = null, selectedPlan = null } = {}) {
  const purchaser = user || (await pool.query('SELECT id, email FROM users WHERE id = $1', [userId])).rows[0];
  if (!purchaser) {
    throw new Error(`User ${userId} not found for marketplace provisioning`);
  }

  const network = await providerNetworkQueries.findById(offering.provider_network_id);
  if (!network) {
    throw new Error(`Provider network ${offering.provider_network_id} not found`);
  }

  const hosts = await providerNetworkQueries.listHosts(offering.provider_network_id);
  const hostUrls = hosts.map((host) => host.host_url).filter(Boolean);
  const panelHost = network.reseller_portal_url || hostUrls[0] || null;
  if (!panelHost || hostUrls.length === 0) {
    throw new Error('No provider hosts configured for marketplace provisioning');
  }

  const lineUsername = buildMarketplaceLineUsername(purchaser, offering);
  const linePassword = buildMarketplaceLinePassword();
  const unixExpiry = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : null;
  const bouquetIds = Array.isArray(selectedPlan?.reseller_bouquet_ids)
    ? selectedPlan.reseller_bouquet_ids
    : Array.isArray(offering.reseller_bouquet_ids) ? offering.reseller_bouquet_ids : [];
  const notes = offering.reseller_notes || `Marketplace provisioned for ${purchaser.email}`;
  const maxConnections = selectedPlan?.max_connections || offering.max_connections || 1;
  const isTrial = selectedPlan?.is_trial === true || (selectedPlan?.trial_days || 0) > 0;

  if (network.xtream_ui_scraped) {
    const session = await ensureManagedNetworkSession(network, panelHost);
    const result = await xtreamUiScraper.createLine(panelHost, session, {
      username: lineUsername,
      password: linePassword,
      maxConnections,
      expDate: unixExpiry,
      bouquetIds,
      trial: isTrial,
      notes,
    });
    if (!result?.success) {
      throw new Error(result?.message || 'Failed to create reseller line');
    }
  } else {
    if (!network.reseller_username || !network.reseller_password) {
      throw new Error('Reseller credentials not configured for this network');
    }

    const result = await providerService.createResellerUser(
      panelHost,
      network.reseller_username,
      network.reseller_password,
      {
        username: lineUsername,
        password: linePassword,
        maxConnections,
        expDate: unixExpiry,
        bouquetIds,
      }
    );

    const resultText = JSON.stringify(result || {}).toLowerCase();
    if (result?.success === false || resultText.includes('error')) {
      throw new Error(result?.message || 'Failed to create reseller line');
    }
  }

  return providerQueries.create({
    userId,
    name: offering.name,
    hosts: hostUrls,
    username: lineUsername,
    password: linePassword,
    networkId: offering.provider_network_id,
  });
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

/**
 * Create a subscription using the user's credit balance.
 * Returns the new subscription record.
 */
async function createSubscriptionFromCredits(userId, offeringId, { planCode = null, autoRenew = true } = {}) {
  const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = userRows[0];
  if (!user) throw new Error('User not found');

  const offering = await offeringQueries.findById(offeringId);
  if (!offering) throw new Error('Offering not found');

  const selectedPlan = resolveSelectedPlan(offering, planCode);
  const priceCents = selectedPlan.price_cents;

  const creditService = require('./creditService');
  const balance = await creditService.getBalance(userId);
  if (balance < priceCents) {
    const err = new Error('Insufficient credits');
    err.status = 402;
    throw err;
  }

  // Atomically spend credits
  await creditService.spendCredits(userId, priceCents, {
    description: `Subscription: ${offering.name} (${selectedPlan.name})`,
  });

  // Create the subscription record
  const sub = await subscriptionQueries.create({
    user_id: userId,
    offering_id: offeringId,
    status: 'active',
    payment_provider: 'credits',
    current_period_start: new Date(),
    current_period_end: resolveSelectedPlanEnd(selectedPlan),
    auto_renew: autoRenew,
    selected_plan_code: selectedPlan.code,
    selected_plan_name: selectedPlan.name,
    selected_price_cents: selectedPlan.price_cents,
    selected_currency: selectedPlan.currency,
    selected_billing_period: selectedPlan.billing_period,
    selected_interval_count: selectedPlan.billing_interval_count,
  });

  // Provision IPTV credentials
  if (offering.provider_network_id) {
    try {
      const userProvider = await provisionCredentials(userId, offering, {
        user,
        expiresAt: sub.current_period_end,
        subscriptionId: sub.id,
        selectedPlan,
      });
      if (userProvider) {
        await subscriptionQueries.update(sub.id, { user_provider_id: userProvider.id });
        sub.user_provider_id = userProvider.id;
      }
    } catch (err) {
      logger.error(`[SubscriptionService] Credential provisioning failed for credits sub ${sub.id}: ${err.message}`);
    }
  }

  // Emit event for CRM sync
  eventBus.emit('subscription.created', { subscription: { ...sub, twenty_person_id: user.twenty_person_id }, user, offering });

  return sub;
}

function resolveSelectedPlanEnd(plan) {
  const end = new Date();
  const count = plan.billing_interval_count || 1;
  if (plan.billing_period === 'day') end.setDate(end.getDate() + count);
  else if (plan.billing_period === 'week') end.setDate(end.getDate() + (count * 7));
  else if (plan.billing_period === 'month') end.setMonth(end.getMonth() + count);
  else if (plan.billing_period === 'year') end.setFullYear(end.getFullYear() + count);
  return end;
}

module.exports = {
  handlePurchase,
  handleSubscriptionUpdated,
  handleSubscriptionCancelled,
  handlePaymentSucceeded,
  handlePaymentFailed,
  createSubscriptionFromCredits,
  // Exported for use by PayGate/credits checkout paths
  provisionCredentialsPublic: provisionCredentials,
};
