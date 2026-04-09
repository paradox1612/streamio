const express = require('express');
const crypto = require('crypto');
const { constructWebhookEvent, isEnabled: stripeEnabled } = require('../services/stripeService');
const subscriptionService = require('../services/subscriptionService');
const { subscriptionQueries, providerQueries } = require('../db/queries');
const logger = require('../utils/logger');

const router = express.Router();

function parseTwentyPayload(rawBody) {
  return JSON.parse(rawBody.toString('utf8'));
}

function verifyTwentySignature(rawBody, headers, secret) {
  if (!secret) return true;

  const signature = headers['x-twenty-webhook-signature'];
  const timestamp = headers['x-twenty-webhook-timestamp'];

  if (!signature || !timestamp) return false;

  const stringToSign = `${timestamp}:${rawBody.toString('utf8')}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(stringToSign)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

function normalizeSubscriptionStatus(status) {
  if (!status) return null;

  const normalized = String(status).trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'canceled') return 'cancelled';
  return normalized;
}

// ─── Stripe Webhooks ──────────────────────────────────────────────────────────
// IMPORTANT: This route must receive the raw (unparsed) body — mount it before
// express.json() in index.js using express.raw({ type: 'application/json' }).

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripeEnabled) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing Stripe-Signature header' });

  let event;
  try {
    event = constructWebhookEvent(req.body, sig);
  } catch (err) {
    logger.error(`[Webhook] Stripe signature verification failed: ${err.message}`);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // Acknowledge immediately — process async
  res.json({ received: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        // Retrieve the full subscription object from Stripe for period dates
        const Stripe = require('stripe');
        const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription);

        await subscriptionService.handlePurchase({
          stripeSession: session,
          stripeSubscription: stripeSub,
        });
        break;
      }

      case 'customer.subscription.updated':
        await subscriptionService.handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await subscriptionService.handleSubscriptionCancelled(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await subscriptionService.handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await subscriptionService.handlePaymentFailed(event.data.object);
        break;

      default:
        logger.debug(`[Webhook] Unhandled Stripe event: ${event.type}`);
    }
  } catch (err) {
    logger.error(`[Webhook] Error processing Stripe event ${event.type}: ${err.message}`);
  }
});

// ─── Twenty CRM Inbound Webhook ───────────────────────────────────────────────
// Configure in Twenty: Settings → APIs & Webhooks → Add Webhook
// pointing at: https://api.example.com/webhooks/twenty

router.post('/twenty', express.raw({ type: 'application/json' }), async (req, res) => {
  const secret = process.env.TWENTY_WEBHOOK_SECRET;

  if (secret && !verifyTwentySignature(req.body, req.headers, secret)) {
    logger.warn('[Webhook] Twenty webhook signature mismatch');
    return res.status(401).json({ error: 'Invalid Twenty webhook signature' });
  }

  let payload;
  try {
    payload = parseTwentyPayload(req.body);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  res.json({ received: true });

  try {
    const eventName = payload?.event;
    const record = payload?.data;

    if (eventName === 'subscription.updated') {
      // Admin overrode a subscription status in Twenty UI
      const stripeSubId = record?.stripeSubscriptionId || record?.stripe_subscription_id;
      const newStatus = normalizeSubscriptionStatus(record?.status);

      if (stripeSubId && newStatus) {
        await subscriptionQueries.updateByStripeId(stripeSubId, { status: newStatus });

        // Activate or revoke user_providers entry based on new status
        const sub = await subscriptionQueries.findByStripeSubscriptionId(stripeSubId);
        if (sub?.user_provider_id) {
          if (newStatus === 'cancelled') {
            await providerQueries.delete(sub.user_provider_id);
          }
          // For other status changes (e.g., reactivating past_due) no action needed
          // unless you want to re-provision credentials in a future phase
        }

        logger.info(`[Webhook] Twenty override: subscription ${stripeSubId} → ${newStatus}`);
      }
    }

    if (eventName === 'task.updated' && normalizeSubscriptionStatus(record?.status) === 'done') {
      // Support task resolved — log it
      logger.info(`[Webhook] Twenty task completed: ${record?.id}`);
    }
  } catch (err) {
    logger.error(`[Webhook] Error processing Twenty event: ${err.message}`);
  }
});

module.exports = router;
