const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const {
  offeringQueries,
  subscriptionQueries,
  paymentQueries,
  providerQueries,
  systemSettingQueries,
  pool,
} = require('../db/queries');
const stripeService = require('../services/stripeService');
const paygateService = require('../services/paygateService');
const creditService = require('../services/creditService');
const subscriptionService = require('../services/subscriptionService');
const logger = require('../utils/logger');
const { resolveSelectedPlan } = require('../utils/marketplacePlans');

// ─── Provider Offerings (catalog) ────────────────────────────────────────────

// GET /api/marketplace/offerings — public listing
router.get('/marketplace/offerings', async (req, res) => {
  try {
    const offerings = await offeringQueries.list();
    res.json(offerings);
  } catch (err) {
    logger.error('GET /marketplace/offerings:', err.message);
    res.status(500).json({ error: 'Failed to load offerings' });
  }
});

// GET /api/marketplace/offerings/:id — single offering detail
router.get('/marketplace/offerings/:id', async (req, res) => {
  try {
    const offering = await offeringQueries.findById(req.params.id);
    if (!offering) return res.status(404).json({ error: 'Offering not found' });
    res.json(offering);
  } catch (err) {
    logger.error('GET /marketplace/offerings/:id:', err.message);
    res.status(500).json({ error: 'Failed to load offering' });
  }
});

// GET /api/marketplace/payment-providers — list enabled payment methods
router.get('/marketplace/payment-providers', requireAuth, async (req, res) => {
  res.json({
    stripe: stripeService.isEnabled,
    paygate: paygateService.isEnabled,
  });
});

// POST /api/marketplace/checkout — create checkout session
// Body: { offering_id, payment_provider: 'stripe' | 'paygate' | 'credits' }
router.post('/marketplace/checkout', requireAuth, async (req, res) => {
  try {
    const { offering_id, payment_provider = 'stripe', confirm_duplicate = false, plan_code = null, auto_renew = true } = req.body;
    if (!offering_id) return res.status(400).json({ error: 'offering_id is required' });

    const offering = await offeringQueries.findById(offering_id);
    if (!offering || !offering.is_active) {
      return res.status(404).json({ error: 'Offering not found or inactive' });
    }

    // Check for existing active subscription
    const existingSubs = await subscriptionQueries.findByUserId(req.user.id);
    const hasActive = existingSubs.some(s => s.offering_id === offering.id && s.status === 'active');
    
    if (hasActive && !confirm_duplicate) {
      return res.status(409).json({
        warning: 'already_subscribed',
        message: 'You already have an active subscription for this plan. Buying another will create a second line. Continue?'
      });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    const selectedPlan = resolveSelectedPlan(offering, plan_code);
    const effectiveAutoRenew = payment_provider === 'stripe' ? auto_renew !== false : false;
    const checkoutOffering = { ...offering, selected_plan: selectedPlan, auto_renew: effectiveAutoRenew };

    // ── Stripe checkout ──
    if (payment_provider === 'stripe') {
      if (!stripeService.isEnabled) {
        return res.status(503).json({ error: 'Stripe is not configured' });
      }
      const { url } = await stripeService.createCheckoutSession(user, checkoutOffering);
      return res.json({ payment_provider: 'stripe', checkout_url: url });
    }

    // ── PayGate checkout ──
    if (payment_provider === 'paygate') {
      if (!paygateService.isEnabled) {
        return res.status(503).json({ error: 'PayGate is not configured' });
      }

      // Create a pending subscription first so we have an ID for the callback
      const sub = await subscriptionQueries.create({
        user_id: user.id,
        offering_id: offering.id,
        status: 'pending_payment',
        payment_provider: 'paygate',
        current_period_start: new Date(),
        current_period_end: paygateService.calcPeriodEnd(selectedPlan.billing_period, selectedPlan.billing_interval_count),
        auto_renew: false,
        selected_plan_code: selectedPlan.code,
        selected_plan_name: selectedPlan.name,
        selected_price_cents: selectedPlan.price_cents,
        selected_currency: selectedPlan.currency,
        selected_billing_period: selectedPlan.billing_period,
        selected_interval_count: selectedPlan.billing_interval_count,
      });

      const callbackBase = `${process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:3001'}/webhooks/paygate`;
      const invoiceId = `sub_${sub.id}`;

      let session;
      try {
        session = await paygateService.createPaymentSession(invoiceId, callbackBase);
      } catch (err) {
        // Roll back the pending subscription on API failure
        await subscriptionQueries.update(sub.id, { status: 'cancelled', cancelled_at: new Date() });
        logger.error('[PayGate checkout] Session creation failed:', err.message);
        return res.status(502).json({ error: 'Failed to create PayGate session. Please try again.' });
      }

      // Persist the tracking address
      await subscriptionQueries.update(sub.id, { paygate_address_in: session.addressIn });

      const checkoutUrl = paygateService.buildCheckoutUrl(session.addressIn, {
        amountCents: selectedPlan.price_cents,
        currency: selectedPlan.currency || offering.currency || 'USD',
        email: user.email,
      });

      return res.json({
        payment_provider: 'paygate',
        checkout_url: checkoutUrl,
        subscription_id: sub.id,
        address_in: session.addressIn,
      });
    }

    // ── Credits checkout ──
    if (payment_provider === 'credits') {
      try {
        const sub = await subscriptionService.createSubscriptionFromCredits(user.id, offering.id, {
          planCode: selectedPlan.code,
          autoRenew: auto_renew !== false,
        });
        return res.json({
          payment_provider: 'credits',
          subscription_id: sub.id,
          status: 'active',
          message: 'Subscription activated with credits',
        });
      } catch (err) {
        if (err.status === 402) {
          const balance = await creditService.getBalance(user.id);
          return res.status(402).json({
            error: 'Insufficient credits',
            balance_cents: balance,
            required_cents: selectedPlan.price_cents,
          });
        }
        logger.error('[Credits checkout] Failed:', err.message);
        return res.status(err.status || 500).json({ error: err.message || 'Failed to process credits payment' });
      }
    }

    return res.status(400).json({ error: `Unknown payment_provider: ${payment_provider}` });
  } catch (err) {
    logger.error('POST /marketplace/checkout:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Failed to create checkout' });
  }
});

// GET /api/marketplace/paygate/status/:addressIn — poll payment status
router.get('/marketplace/paygate/status/:addressIn', requireAuth, async (req, res) => {
  try {
    const sub = await subscriptionQueries.findByPaygateAddressIn(req.params.addressIn);
    if (!sub || sub.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ status: sub.status, subscription_id: sub.id });
  } catch (err) {
    logger.error('GET /marketplace/paygate/status:', err.message);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// ─── Subscriptions ────────────────────────────────────────────────────────────

// GET /api/subscriptions — user's active subscriptions
router.get('/subscriptions', requireAuth, async (req, res) => {
  try {
    const subs = await subscriptionQueries.findByUserId(req.user.id);
    res.json(subs);
  } catch (err) {
    logger.error('GET /subscriptions:', err.message);
    res.status(500).json({ error: 'Failed to load subscriptions' });
  }
});

// GET /api/subscriptions/portal — must come BEFORE /:id to avoid route conflict
router.get('/subscriptions/portal', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    const { url } = await stripeService.createPortalSession(user);
    res.json({ portal_url: url });
  } catch (err) {
    logger.error('GET /subscriptions/portal:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Failed to create portal session' });
  }
});

// POST /api/subscriptions/:id/cancel
router.post('/subscriptions/:id/cancel', requireAuth, async (req, res) => {
  try {
    const sub = await subscriptionQueries.findById(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    if (sub.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    if (sub.status === 'cancelled') {
      return res.status(400).json({ error: 'Subscription is already cancelled' });
    }

    // Stripe subscriptions: cancel via Stripe (at period end)
    if (sub.payment_provider === 'stripe' && sub.stripe_subscription_id) {
      await stripeService.cancelSubscription(sub.stripe_subscription_id);
      await subscriptionQueries.update(sub.id, { cancel_at_period_end: true });
      return res.json({
        message: 'Subscription will be cancelled at the end of the billing period',
        cancels_at: sub.current_period_end,
      });
    }

    // PayGate / credits subscriptions: cancel immediately (no recurring billing)
    await subscriptionQueries.update(sub.id, {
      status: 'cancelled',
      cancelled_at: new Date(),
    });
    if (sub.user_provider_id) {
      try { await providerQueries.delete(sub.user_provider_id); } catch {}
    }
    return res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    logger.error('POST /subscriptions/:id/cancel:', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// ─── Payment History ──────────────────────────────────────────────────────────

// GET /api/payments/history
router.get('/payments/history', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const transactions = await paymentQueries.listByUser(req.user.id, { limit, offset });
    res.json(transactions);
  } catch (err) {
    logger.error('GET /payments/history:', err.message);
    res.status(500).json({ error: 'Failed to load payment history' });
  }
});

// ─── Credits ──────────────────────────────────────────────────────────────────

// GET /api/credits/balance
router.get('/credits/balance', requireAuth, async (req, res) => {
  try {
    const balance = await creditService.getBalance(req.user.id);
    res.json({ balance_cents: balance });
  } catch (err) {
    logger.error('GET /credits/balance:', err.message);
    res.status(500).json({ error: 'Failed to load credit balance' });
  }
});

// GET /api/credits/transactions
router.get('/credits/transactions', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const txs = await creditService.listTransactions(req.user.id, { limit, offset });
    res.json(txs);
  } catch (err) {
    logger.error('GET /credits/transactions:', err.message);
    res.status(500).json({ error: 'Failed to load credit transactions' });
  }
});

// GET /api/credits/config — get top-up limits and presets
router.get('/credits/config', requireAuth, async (req, res) => {
  try {
    const config = await systemSettingQueries.get('credits_config');
    res.json(config || {
      min_topup_cents: 500,
      max_topup_cents: 100000,
      presets: [
        { label: '$10', cents: 1000 },
        { label: '$25', cents: 2500 },
        { label: '$50', cents: 5000 },
        { label: '$100', cents: 10000 },
      ],
      allow_custom_amount: true,
    });
  } catch (err) {
    logger.error('GET /credits/config:', err.message);
    res.status(500).json({ error: 'Failed to load credit configuration' });
  }
});

// POST /api/credits/topup — initiate a PayGate credit purchase
// Body: { amount_cents: number }  (min $5 = 500 cents)
router.post('/credits/topup', requireAuth, async (req, res) => {
  try {
    if (!paygateService.isEnabled) {
      return res.status(503).json({ error: 'PayGate is not configured' });
    }

    const config = (await systemSettingQueries.get('credits_config')) || {
      min_topup_cents: 500,
      max_topup_cents: 100000,
    };

    const { amount_cents } = req.body;
    if (!amount_cents || amount_cents < config.min_topup_cents) {
      return res.status(400).json({
        error: `Minimum top-up is $${(config.min_topup_cents / 100).toFixed(2)}`,
      });
    }
    if (amount_cents > config.max_topup_cents) {
      return res.status(400).json({
        error: `Maximum top-up is $${(config.max_topup_cents / 100).toFixed(2)} per transaction`,
      });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];

    // Create a pending credit transaction
    const tx = await creditService.createPendingTopup(user.id, amount_cents, {
      type: 'topup_paygate',
    });

    const invoiceId = `cred_${tx.id}`;
    const callbackBase = `${process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:3001'}/webhooks/paygate`;

    let session;
    try {
      session = await paygateService.createPaymentSession(invoiceId, callbackBase);
    } catch (err) {
      // Mark the pending tx as failed
      await pool.query(
        `UPDATE credit_transactions SET status = 'failed' WHERE id = $1`,
        [tx.id]
      );
      logger.error('[Credits topup] PayGate session failed:', err.message);
      return res.status(502).json({ error: 'Failed to create PayGate session. Please try again.' });
    }

    // Persist tracking address on the credit transaction
    await pool.query(
      `UPDATE credit_transactions SET reference_id = $1 WHERE id = $2`,
      [invoiceId, tx.id]
    );

    const checkoutUrl = paygateService.buildCheckoutUrl(session.addressIn, {
      amountCents: amount_cents,
      currency: 'USD',
      email: user.email,
    });

    res.json({
      checkout_url: checkoutUrl,
      address_in: session.addressIn,
      credit_transaction_id: tx.id,
      amount_cents,
    });
  } catch (err) {
    logger.error('POST /credits/topup:', err.message);
    res.status(500).json({ error: 'Failed to initiate credit top-up' });
  }
});

// GET /api/credits/topup/status/:creditTxId — poll top-up payment status
router.get('/credits/topup/status/:creditTxId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM credit_transactions WHERE id = $1 AND user_id = $2`,
      [req.params.creditTxId, req.user.id]
    );
    const tx = rows[0];
    if (!tx) return res.status(404).json({ error: 'Not found' });
    res.json({ status: tx.status, amount_cents: tx.amount_cents });
  } catch (err) {
    logger.error('GET /credits/topup/status:', err.message);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

module.exports = router;
