const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { offeringQueries, subscriptionQueries, paymentQueries, pool } = require('../db/queries');
const stripeService = require('../services/stripeService');
const logger = require('../utils/logger');

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

// POST /api/marketplace/checkout — create Stripe Checkout Session
router.post('/marketplace/checkout', requireAuth, async (req, res) => {
  try {
    const { offering_id } = req.body;
    if (!offering_id) return res.status(400).json({ error: 'offering_id is required' });

    const offering = await offeringQueries.findById(offering_id);
    if (!offering || !offering.is_active) {
      return res.status(404).json({ error: 'Offering not found or inactive' });
    }
    if (!offering.stripe_price_id) {
      return res.status(400).json({ error: 'Offering is not yet linked to Stripe' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];

    const { url } = await stripeService.createCheckoutSession(user, offering);
    res.json({ checkout_url: url });
  } catch (err) {
    logger.error('POST /marketplace/checkout:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
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

    await stripeService.cancelSubscription(sub.stripe_subscription_id);
    await subscriptionQueries.update(sub.id, { cancel_at_period_end: true });

    res.json({
      message: 'Subscription will be cancelled at the end of the billing period',
      cancels_at: sub.current_period_end,
    });
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

module.exports = router;
