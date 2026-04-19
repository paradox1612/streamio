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
const paymentProviderConfigService = require('../services/paymentProviderConfigService');
const paymentProviderRegistry = require('../services/paymentProviderRegistry');
const creditService = require('../services/creditService');
const subscriptionService = require('../services/subscriptionService');
const logger = require('../utils/logger');
const { resolveSelectedPlan } = require('../utils/marketplacePlans');

const DEFAULT_CREDITS_CONFIG = {
  min_topup_cents: 500,
  max_topup_cents: 100000,
  presets: [
    { label: '$10', cents: 1000 },
    { label: '$25', cents: 2500 },
    { label: '$50', cents: 5000 },
    { label: '$100', cents: 10000 },
  ],
  allow_custom_amount: true,
};

async function getCreditsConfig() {
  const config = await systemSettingQueries.get('credits_config');
  return config || DEFAULT_CREDITS_CONFIG;
}

async function getProviderRules() {
  const entries = await Promise.all(
    paymentProviderRegistry.listProviders().map(async (provider) => {
      const config = await paymentProviderConfigService.getProvider(provider.id);
      return [
        provider.id,
        {
          minimum_amount_cents: config.minimum_amount_cents || 0,
          promo_credit_percent: config.promo_credit_percent || 0,
        },
      ];
    })
  );
  return Object.fromEntries(entries);
}

function getMinimumAmountError(providerLabel, minimumAmountCents, amountCents) {
  return `${providerLabel} requires a minimum payment of $${(minimumAmountCents / 100).toFixed(2)}. Current amount is $${(amountCents / 100).toFixed(2)}.`;
}

function getTopupCreditAmounts(amountCents, promoCreditPercent) {
  const bonusCreditCents = Math.round(amountCents * (promoCreditPercent / 100));
  return {
    creditedAmountCents: amountCents + bonusCreditCents,
    bonusCreditCents,
  };
}

async function getVisibleMarketplaceProviders() {
  const config = await paymentProviderConfigService.getAll();

  const providers = await Promise.all(
    paymentProviderRegistry.listProviders().map(async (provider) => {
      const providerConfig = await paymentProviderConfigService.getProvider(provider.id);
      const enabledByService = await provider.isEnabled();
      const dbCfg = config[provider.id] || {};

      let visible = enabledByService;
      if (dbCfg.enabled === false || dbCfg.visible === false) visible = false;
      else if (dbCfg.visible === true) visible = enabledByService || dbCfg.enabled === true;

      return {
        id: provider.id,
        label: provider.label,
        customer_description: provider.customer_description,
        customer_subtitle: provider.customer_subtitle,
        icon: provider.icon,
        accent_color: provider.accent_color,
        supports: provider.supports,
        enabled: enabledByService,
        visible,
        minimum_amount_cents: providerConfig.minimum_amount_cents || 0,
        promo_credit_percent: providerConfig.promo_credit_percent || 0,
      };
    })
  );

  return providers;
}

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

// GET /api/marketplace/payment-providers — list enabled payment methods (DB visibility + env keys)
router.get('/marketplace/payment-providers', requireAuth, async (req, res) => {
  try {
    const providers = await getVisibleMarketplaceProviders();
    res.json({
      providers,
      ...Object.fromEntries(providers.map((provider) => [provider.id, provider.visible])),
      provider_rules: Object.fromEntries(
        providers.map((provider) => [provider.id, {
          minimum_amount_cents: provider.minimum_amount_cents,
          promo_credit_percent: provider.promo_credit_percent,
        }])
      ),
    });
  } catch (err) {
    logger.error('GET /marketplace/payment-providers:', err.message);
    res.status(500).json({ error: 'Failed to load payment providers' });
  }
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
    const providerRules = await getProviderRules();
    const provider = paymentProviderRegistry.getProvider(payment_provider);

    if (provider?.supports?.subscription) {
      const providerRule = providerRules[payment_provider];
      const minimumAmountCents = providerRule?.minimum_amount_cents || 0;
      if (selectedPlan.price_cents < minimumAmountCents) {
        return res.status(400).json({
          error: getMinimumAmountError(provider.label, minimumAmountCents, selectedPlan.price_cents),
        });
      }
    }

    if (provider?.supports?.subscription) {
      const enabled = await provider.isEnabled();
      if (!enabled) {
        return res.status(503).json({ error: `${provider.label} is not configured` });
      }
      return res.json(await provider.createSubscriptionCheckout({
        user,
        offering,
        selectedPlan,
        checkoutOffering,
      }));
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

// GET /api/subscriptions/resolve?stripe_session_id=cs_xxx
// Called by the provisioning page when returning from Stripe checkout.
// Resolves a Stripe checkout session ID → our subscription ID.
router.get('/subscriptions/resolve', requireAuth, async (req, res) => {
  try {
    const { stripe_session_id } = req.query;
    if (!stripe_session_id) return res.status(400).json({ error: 'stripe_session_id required' });

    // Retrieve the session from Stripe to get the subscription ID
    const session = await stripeService.retrieveCheckoutSession(stripe_session_id);
    if (!session?.subscription) {
      // Webhook may not have fired yet — return 202 so frontend can retry
      return res.status(202).json({ pending: true, message: 'Payment processing, please wait…' });
    }

    const sub = await subscriptionQueries.findByStripeSubscriptionId(session.subscription);
    if (!sub || sub.user_id !== req.user.id) {
      return res.status(202).json({ pending: true, message: 'Setting up your subscription…' });
    }

    res.json({ subscription_id: sub.id });
  } catch (err) {
    logger.error('GET /subscriptions/resolve:', err.message);
    res.status(500).json({ error: 'Failed to resolve subscription' });
  }
});

// GET /api/subscriptions/:id/provision-status
// Polled by the frontend spinner after checkout to track async provisioning.
router.get('/subscriptions/:id/provision-status', requireAuth, async (req, res) => {
  try {
    const row = await subscriptionQueries.findProvisionStatus(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Subscription not found' });
    res.json(row);
  } catch (err) {
    logger.error('GET /subscriptions/:id/provision-status:', err.message);
    res.status(500).json({ error: 'Failed to fetch provisioning status' });
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
    const [config, providers] = await Promise.all([
      getCreditsConfig(),
      getVisibleMarketplaceProviders(),
    ]);
    res.json({
      ...config,
      topup_providers: providers.filter((provider) => provider.visible && provider.supports.topup),
    });
  } catch (err) {
    logger.error('GET /credits/config:', err.message);
    res.status(500).json({ error: 'Failed to load credit configuration' });
  }
});

// POST /api/credits/topup — initiate a credit purchase
// Body: { amount_cents: number, payment_provider?: 'paygate' | 'helcim' | 'square' }
router.post('/credits/topup', requireAuth, async (req, res) => {
  try {
    const { amount_cents, payment_provider = 'paygate' } = req.body;

    const config = await getCreditsConfig();
    const providerRules = await getProviderRules();
    const provider = paymentProviderRegistry.getProvider(payment_provider);
    const providerRule = providerRules[payment_provider];

    if (!provider || !provider.supports.topup || !providerRule) {
      return res.status(400).json({ error: `Unknown payment_provider: ${payment_provider}` });
    }

    const effectiveMinimumCents = Math.max(config.min_topup_cents || 0, providerRule.minimum_amount_cents || 0);

    if (!amount_cents || amount_cents < effectiveMinimumCents) {
      return res.status(400).json({
        error: getMinimumAmountError(provider.label, effectiveMinimumCents, amount_cents || 0),
      });
    }
    if (amount_cents > config.max_topup_cents) {
      return res.status(400).json({
        error: `Maximum top-up is $${(config.max_topup_cents / 100).toFixed(2)} per transaction`,
      });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    const { creditedAmountCents, bonusCreditCents } = getTopupCreditAmounts(amount_cents, providerRule.promo_credit_percent || 0);
    const enabled = await provider.isEnabled();
    if (!enabled) {
      return res.status(503).json({ error: `${provider.label} is not configured` });
    }

    const checkout = await provider.createTopupCheckout({
      user,
      amountCents: amount_cents,
      creditedAmountCents,
      promoCreditPercent: providerRule.promo_credit_percent || 0,
    });

    return res.json({
      ...checkout,
      amount_cents: creditedAmountCents,
      paid_amount_cents: amount_cents,
      bonus_credit_cents: bonusCreditCents,
      promo_credit_percent: providerRule.promo_credit_percent || 0,
    });
  } catch (err) {
    logger.error('POST /credits/topup:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Failed to initiate credit top-up' });
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
