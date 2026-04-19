const Stripe = require('stripe');
const { pool } = require('../db/queries');
const logger = require('../utils/logger');

const STRIPE_ENABLED = process.env.STRIPE_ENABLED !== 'false' && !!process.env.STRIPE_SECRET_KEY;

function stripeDisabledError() {
  const err = new Error('Stripe is not configured');
  err.status = 503;
  return err;
}

function getStripe() {
  if (!STRIPE_ENABLED) {
    throw stripeDisabledError();
  }
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

/**
 * Retrieve existing Stripe customer or create one, then persist to users table.
 */
async function createOrGetCustomer(user) {
  const stripe = getStripe();
  if (user.stripe_customer_id) {
    return stripe.customers.retrieve(user.stripe_customer_id);
  }

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { streamio_user_id: user.id },
  });

  await pool.query(
    'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
    [customer.id, user.id]
  );

  return customer;
}

/**
 * Create a Stripe Checkout Session for a subscription purchase.
 * Returns { url } — redirect the browser to this URL.
 */
async function createCheckoutSession(user, offering) {
  const stripe = getStripe();
  const customer = await createOrGetCustomer(user);
  const selectedPlan = offering.selected_plan;

  const recurring = {
    interval: selectedPlan?.billing_period === 'year'
      ? 'year'
      : selectedPlan?.billing_period === 'day'
        ? 'day'
        : 'month',
    interval_count: selectedPlan?.billing_interval_count || 1,
  };

  const lineItem = offering.stripe_product_id
    ? {
      price_data: {
        product: offering.stripe_product_id,
        currency: (selectedPlan?.currency || offering.currency || 'usd').toLowerCase(),
        unit_amount: selectedPlan?.price_cents || offering.price_cents,
        recurring,
      },
      quantity: 1,
    }
    : {
      price_data: {
        currency: (selectedPlan?.currency || offering.currency || 'usd').toLowerCase(),
        unit_amount: selectedPlan?.price_cents || offering.price_cents,
        recurring,
        product_data: {
          name: offering.name,
          description: offering.description || undefined,
          metadata: { streamio_offering_id: offering.id },
        },
      },
      quantity: 1,
    };

  const sessionParams = {
    customer: customer.id,
    mode: 'subscription',
    line_items: [lineItem],
    success_url: `${process.env.FRONTEND_URL}/subscriptions/provisioning?stripe_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/marketplace`,
    metadata: {
      streamio_user_id: user.id,
      streamio_offering_id: offering.id,
      streamio_plan_code: selectedPlan?.code || 'default',
      streamio_auto_renew: offering.auto_renew === false ? 'false' : 'true',
    },
    subscription_data: {
      metadata: {
        streamio_user_id: user.id,
        streamio_offering_id: offering.id,
        streamio_plan_code: selectedPlan?.code || 'default',
        streamio_auto_renew: offering.auto_renew === false ? 'false' : 'true',
      },
    },
  };

  if ((selectedPlan?.trial_days || offering.trial_days) > 0) {
    sessionParams.subscription_data.trial_period_days = selectedPlan?.trial_days || offering.trial_days;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return { url: session.url };
}

/**
 * Create a Stripe Customer Portal session for self-service billing.
 */
async function createPortalSession(user) {
  const stripe = getStripe();
  if (!user.stripe_customer_id) {
    const err = new Error('No billing account found');
    err.status = 404;
    throw err;
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${process.env.FRONTEND_URL}/subscriptions`,
  });

  return { url: session.url };
}

/**
 * Cancel a Stripe subscription at period end.
 */
async function cancelSubscription(stripeSubId) {
  const stripe = getStripe();
  return stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: true });
}

/**
 * Verify and construct a Stripe webhook event from the raw request body.
 */
function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

/**
 * Create a Stripe Product + Price for a new offering.
 * Returns { productId, priceId }.
 */
async function createProductAndPrice(offering) {
  const stripe = getStripe();
  const product = await stripe.products.create({
    name: offering.name,
    description: offering.description || undefined,
    metadata: { streamio_offering_id: offering.id },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: offering.price_cents,
    currency: offering.currency || 'usd',
    recurring: {
      interval: offering.billing_period === 'year' ? 'year' : offering.billing_period === 'day' ? 'day' : 'month',
      interval_count: offering.billing_interval_count || 1,
    },
    metadata: { streamio_offering_id: offering.id },
  });

  return { productId: product.id, priceId: price.id };
}

async function syncOffering(offering, previousOffering = null) {
  const stripe = getStripe();
  let productId = offering.stripe_product_id || previousOffering?.stripe_product_id || null;

  if (!productId) {
    const created = await createProductAndPrice(offering);
    return created;
  }

  await stripe.products.update(productId, {
    name: offering.name,
    description: offering.description || undefined,
    metadata: { streamio_offering_id: offering.id },
  });

  const priceChanged =
    !offering.stripe_price_id ||
    !previousOffering ||
    offering.price_cents !== previousOffering.price_cents ||
    offering.currency !== previousOffering.currency ||
    offering.billing_period !== previousOffering.billing_period ||
    offering.billing_interval_count !== previousOffering.billing_interval_count;

  if (!priceChanged) {
    return {
      productId,
      priceId: offering.stripe_price_id || previousOffering?.stripe_price_id || null,
    };
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: offering.price_cents,
    currency: offering.currency || 'usd',
    recurring: {
      interval: offering.billing_period === 'year' ? 'year' : offering.billing_period === 'day' ? 'day' : 'month',
      interval_count: offering.billing_interval_count || 1,
    },
    metadata: { streamio_offering_id: offering.id },
  });

  return { productId, priceId: price.id };
}

async function retrieveCheckoutSession(sessionId) {
  if (!stripe) return null;
  try {
    return await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
  } catch (err) {
    return null;
  }
}

module.exports = {
  isEnabled: STRIPE_ENABLED,
  createOrGetCustomer,
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
  constructWebhookEvent,
  createProductAndPrice,
  syncOffering,
  retrieveCheckoutSession,
};
