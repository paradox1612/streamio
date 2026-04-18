const express = require('express');
const crypto = require('crypto');
const { constructWebhookEvent, isEnabled: stripeEnabled } = require('../services/stripeService');
const paygateService = require('../services/paygateService');
const helcimService = require('../services/helcimService');
const squareService = require('../services/squareService');
const creditService = require('../services/creditService');
const subscriptionService = require('../services/subscriptionService');
const { subscriptionQueries, providerQueries, paymentQueries, offeringQueries, pool } = require('../db/queries');
const eventBus = require('../utils/eventBus');
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

// ─── PayGate Callback (GET) ───────────────────────────────────────────────────
// PayGate.to calls this endpoint when a payment is confirmed on-chain.
// Responds with plain-text "*ok*" to acknowledge receipt.
// URL format: GET /webhooks/paygate?invoice_id=<id>&sig=<hmac>&txid_out=<tx>&value_coin=<amount>&coin=<token>

router.get('/paygate', async (req, res) => {
  const { invoice_id, sig, txid_out, value_coin, coin } = req.query;

  if (!invoice_id || !sig) {
    logger.warn('[Webhook/PayGate] Missing invoice_id or sig');
    return res.status(400).send('missing params');
  }

  // Verify HMAC signature
  if (!paygateService.verifyCallbackSig(invoice_id, sig)) {
    logger.warn(`[Webhook/PayGate] Signature mismatch for invoice ${invoice_id}`);
    return res.status(401).send('invalid sig');
  }

  // Acknowledge immediately — PayGate requires *ok* response
  res.set('Content-Type', 'text/plain').send('*ok*');

  logger.info(`[Webhook/PayGate] Payment confirmed: invoice=${invoice_id} txid=${txid_out} amount=${value_coin} ${coin}`);

  try {
    // invoice_id is prefixed: 'sub_<uuid>' for subscriptions, 'cred_<uuid>' for credit top-ups
    if (invoice_id.startsWith('sub_')) {
      const subId = invoice_id.slice(4);
      const sub = await subscriptionQueries.findById(subId);
      if (!sub) {
        logger.error(`[Webhook/PayGate] Subscription ${subId} not found`);
        return;
      }
      if (sub.status !== 'pending_payment') {
        logger.info(`[Webhook/PayGate] Subscription ${subId} already in status=${sub.status}, skipping`);
        return;
      }

      // Activate the subscription
      const periodEnd = paygateService.calcPeriodEnd(
        sub.selected_billing_period || sub.billing_period,
        sub.selected_interval_count || sub.billing_interval_count || 1
      );
      await subscriptionQueries.update(subId, {
        status: 'active',
        current_period_start: new Date(),
        current_period_end: periodEnd,
      });

      // Provision IPTV credentials if not already done
      if (!sub.user_provider_id && sub.provider_network_id) {
        try {
          const offering = await offeringQueries.findById(sub.offering_id);
          const userProvider = await subscriptionService.provisionCredentialsPublic(
            sub.user_id,
            offering || {
              name: sub.offering_name,
              provider_network_id: sub.provider_network_id,
            },
            {
              expiresAt: periodEnd,
              selectedPlan: offering
                ? {
                  code: sub.selected_plan_code,
                  name: sub.selected_plan_name,
                  price_cents: sub.selected_price_cents,
                  currency: sub.selected_currency,
                  billing_period: sub.selected_billing_period,
                  billing_interval_count: sub.selected_interval_count,
                }
                : null,
            }
          );
          if (userProvider) {
            await subscriptionQueries.update(subId, { user_provider_id: userProvider.id });
          }
        } catch (err) {
          logger.error(`[Webhook/PayGate] Credential provisioning failed: ${err.message}`);
        }
      }

      // Record payment transaction
      await paymentQueries.insert({
        user_id: sub.user_id,
        subscription_id: subId,
        amount_cents: sub.selected_price_cents || sub.price_cents || 0,
        currency: sub.selected_currency || 'usd',
        status: 'succeeded',
        payment_provider: 'paygate',
        paygate_address_in: sub.paygate_address_in,
      });

      eventBus.emit('subscription.created', { subscription: sub });
      logger.info(`[Webhook/PayGate] Subscription ${subId} activated`);

    } else if (invoice_id.startsWith('cred_')) {
      // Credit top-up confirmed
      const result = await creditService.confirmTopup(invoice_id);
      if (result) {
        logger.info(`[Webhook/PayGate] Credit topup confirmed: +${result.amountCents}¢ for user ${result.userId}`);
      } else {
        logger.warn(`[Webhook/PayGate] Credit topup ${invoice_id} not found or already processed`);
      }
    } else {
      logger.warn(`[Webhook/PayGate] Unknown invoice_id prefix: ${invoice_id}`);
    }
  } catch (err) {
    logger.error(`[Webhook/PayGate] Error processing callback: ${err.message}`);
  }
});

// ─── Helcim Webhook (POST) ────────────────────────────────────────────────────
// Helcim sends a POST with transaction data when a payment is approved.
// Configure in myHelcim dashboard: Settings → Integrations → Webhooks

router.post('/helcim', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!helcimService.isEnabled) {
    return res.status(503).json({ error: 'Helcim is not configured' });
  }

  const sig = req.headers['x-helcim-signature'] || req.headers['helcim-signature'];
  if (!helcimService.verifyWebhookSignature(req.body, sig)) {
    logger.warn('[Webhook/Helcim] Signature verification failed');
    return res.status(401).json({ error: 'Invalid Helcim webhook signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Acknowledge immediately — process async
  res.json({ received: true });

  try {
    const { transactionId, status, invoiceNumber, amount, currency } = payload;

    if (String(status).toUpperCase() !== 'APPROVED') {
      logger.info(`[Webhook/Helcim] Non-approved transaction status=${status} for invoice=${invoiceNumber}`);
      return;
    }

    // ── Credit top-up ──
    if (invoiceNumber?.startsWith('cred_')) {
      const result = await creditService.confirmTopup(invoiceNumber);
      if (result) {
        logger.info(`[Webhook/Helcim] Credit topup confirmed: +${result.amountCents}¢ for user ${result.userId}`);
      } else {
        logger.warn(`[Webhook/Helcim] Credit topup ${invoiceNumber} not found or already processed`);
      }
      return;
    }

    if (!invoiceNumber?.startsWith('sub_')) {
      logger.warn(`[Webhook/Helcim] Unknown invoiceNumber format: ${invoiceNumber}`);
      return;
    }

    const subId = invoiceNumber.slice(4);
    const sub = await subscriptionQueries.findById(subId);

    if (!sub) {
      logger.error(`[Webhook/Helcim] Subscription ${subId} not found`);
      return;
    }

    if (sub.status !== 'pending_payment') {
      logger.info(`[Webhook/Helcim] Subscription ${subId} already status=${sub.status}, skipping`);
      return;
    }

    const periodEnd = helcimService.calcPeriodEnd(
      sub.selected_billing_period || sub.billing_period,
      sub.selected_interval_count || sub.billing_interval_count || 1
    );

    // Activate subscription and store Helcim transaction ID
    await subscriptionQueries.update(subId, {
      status: 'active',
      current_period_start: new Date(),
      current_period_end: periodEnd,
      helcim_transaction_id: transactionId ? String(transactionId) : null,
    });

    // Record payment transaction
    const amountCents = amount != null
      ? Math.round(parseFloat(amount) * 100)
      : sub.selected_price_cents || 0;

    await paymentQueries.insert({
      user_id: sub.user_id,
      subscription_id: subId,
      amount_cents: amountCents,
      currency: (currency || sub.selected_currency || 'usd').toLowerCase(),
      status: 'succeeded',
      payment_provider: 'helcim',
      helcim_transaction_id: transactionId ? String(transactionId) : null,
    });

    // Provision IPTV credentials in background
    if (!sub.user_provider_id && sub.provider_network_id) {
      try {
        const offering = await offeringQueries.findById(sub.offering_id);
        const userProvider = await subscriptionService.provisionCredentialsPublic(
          sub.user_id,
          offering || { name: sub.offering_name, provider_network_id: sub.provider_network_id },
          {
            expiresAt: periodEnd,
            selectedPlan: offering
              ? {
                code: sub.selected_plan_code,
                name: sub.selected_plan_name,
                price_cents: sub.selected_price_cents,
                currency: sub.selected_currency,
                billing_period: sub.selected_billing_period,
                billing_interval_count: sub.selected_interval_count,
              }
              : null,
          }
        );
        if (userProvider) {
          await subscriptionQueries.update(subId, { user_provider_id: userProvider.id });
        }
      } catch (err) {
        logger.error(`[Webhook/Helcim] Credential provisioning failed: ${err.message}`);
      }
    }

    eventBus.emit('subscription.created', { subscription: sub });
    logger.info(`[Webhook/Helcim] Subscription ${subId} activated, transactionId=${transactionId}`);
  } catch (err) {
    logger.error(`[Webhook/Helcim] Error processing webhook: ${err.message}`);
  }
});

// ─── Square Webhook (POST) ────────────────────────────────────────────────────
// Square sends payment events here. Configure in Square Developer Dashboard:
// Webhooks → Add Webhook → URL: https://your-api-domain/webhooks/square
// Subscribe to: payment.updated

router.post('/square', express.raw({ type: 'application/json' }), async (req, res) => {
  const squareEnabled = await squareService.isEnabled();
  if (!squareEnabled) {
    return res.status(503).json({ error: 'Square is not configured' });
  }

  const sig = req.headers['x-square-hmacsha256-signature'];
  const notificationUrl = `${process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:3001'}/webhooks/square`;

  if (!await squareService.verifyWebhookSignature(req.body, sig, notificationUrl)) {
    logger.warn('[Webhook/Square] Signature verification failed');
    return res.status(401).json({ error: 'Invalid Square webhook signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Acknowledge immediately
  res.json({ received: true });

  try {
    const eventType = payload?.type;
    const paymentObj = payload?.data?.object?.payment;

    if (eventType !== 'payment.updated' || !paymentObj) {
      logger.debug(`[Webhook/Square] Unhandled event type: ${eventType}`);
      return;
    }

    if (paymentObj.status !== 'COMPLETED') {
      logger.info(`[Webhook/Square] Payment not completed (status=${paymentObj.status}), skipping`);
      return;
    }

    const orderId = paymentObj.order_id;
    if (!orderId) {
      logger.warn('[Webhook/Square] Payment has no order_id');
      return;
    }

    // ── Credit top-up (reference_id starts with cred_) ──
    const creditResult = await creditService.confirmTopupBySquareOrderId(orderId);
    if (creditResult) {
      logger.info(`[Webhook/Square] Credit topup confirmed: +${creditResult.amountCents}¢ for user ${creditResult.userId}`);
      return;
    }

    const sub = await subscriptionQueries.findBySquareOrderId(orderId);
    if (!sub) {
      logger.warn(`[Webhook/Square] No subscription found for order_id=${orderId}`);
      return;
    }

    if (sub.status !== 'pending_payment') {
      logger.info(`[Webhook/Square] Subscription ${sub.id} already status=${sub.status}, skipping`);
      return;
    }

    const periodEnd = squareService.calcPeriodEnd(
      sub.selected_billing_period || sub.billing_period,
      sub.selected_interval_count || sub.billing_interval_count || 1
    );

    await subscriptionQueries.update(sub.id, {
      status: 'active',
      current_period_start: new Date(),
      current_period_end: periodEnd,
    });

    const amountCents = paymentObj.amount_money?.amount ?? sub.selected_price_cents ?? 0;
    const currency = (paymentObj.amount_money?.currency || sub.selected_currency || 'usd').toLowerCase();

    await paymentQueries.insert({
      user_id: sub.user_id,
      subscription_id: sub.id,
      amount_cents: amountCents,
      currency,
      status: 'succeeded',
      payment_provider: 'square',
      square_payment_id: paymentObj.id,
    });

    // Provision IPTV credentials in background
    if (!sub.user_provider_id && sub.provider_network_id) {
      try {
        const offering = await offeringQueries.findById(sub.offering_id);
        const userProvider = await subscriptionService.provisionCredentialsPublic(
          sub.user_id,
          offering || { name: sub.offering_name, provider_network_id: sub.provider_network_id },
          {
            expiresAt: periodEnd,
            selectedPlan: offering ? {
              code: sub.selected_plan_code,
              name: sub.selected_plan_name,
              price_cents: sub.selected_price_cents,
              currency: sub.selected_currency,
              billing_period: sub.selected_billing_period,
              billing_interval_count: sub.selected_interval_count,
            } : null,
          }
        );
        if (userProvider) {
          await subscriptionQueries.update(sub.id, { user_provider_id: userProvider.id });
        }
      } catch (err) {
        logger.error(`[Webhook/Square] Credential provisioning failed: ${err.message}`);
      }
    }

    eventBus.emit('subscription.created', { subscription: sub });
    logger.info(`[Webhook/Square] Subscription ${sub.id} activated, paymentId=${paymentObj.id}`);
  } catch (err) {
    logger.error(`[Webhook/Square] Error processing webhook: ${err.message}`);
  }
});

module.exports = router;
