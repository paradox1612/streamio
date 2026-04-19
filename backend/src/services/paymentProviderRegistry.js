const { pool, subscriptionQueries } = require('../db/queries');
const stripeService = require('./stripeService');
const paygateService = require('./paygateService');
const helcimService = require('./helcimService');
const squareService = require('./squareService');
const creditService = require('./creditService');
const logger = require('../utils/logger');

function getTopupDescription(provider, amountCents, creditedAmountCents, promoCreditPercent) {
  const creditedAmountLabel = `$${(creditedAmountCents / 100).toFixed(2)}`;
  const paidAmountLabel = `$${(amountCents / 100).toFixed(2)}`;
  if (promoCreditPercent > 0 && creditedAmountCents > amountCents) {
    return `Credit top-up via ${provider.label}: paid ${paidAmountLabel}, credited ${creditedAmountLabel} (${promoCreditPercent}% bonus)`;
  }
  return `Credit top-up via ${provider.label}: ${creditedAmountLabel}`;
}

const PAYMENT_PROVIDER_DEFINITIONS = [
  {
    id: 'stripe',
    label: 'Stripe',
    admin_description: 'Recurring subscriptions with auto-renewal. Industry standard.',
    customer_description: 'Secure credit card processing',
    customer_subtitle: 'Credit card (recurring)',
    icon: 'credit-card',
    accent_color: 'indigo',
    supports: {
      subscription: true,
      topup: false,
      recurring: true,
    },
    defaults: {
      enabled: false,
      visible: false,
      secret_key: '',
      webhook_secret: '',
      publishable_key: '',
      minimum_amount_cents: 0,
      promo_credit_percent: 0,
    },
    fields: [
      { key: 'secret_key', kind: 'secret', label: 'Secret Key', placeholder: 'sk_live_...', hint: 'Found in Stripe Dashboard → Developers → API keys', sensitive: true },
      { key: 'webhook_secret', kind: 'secret', label: 'Webhook Secret', placeholder: 'whsec_...', hint: 'Webhook endpoint: /webhooks/stripe', sensitive: true },
      { key: 'publishable_key', kind: 'text', label: 'Publishable Key (optional)', placeholder: 'pk_live_...' },
      { key: 'minimum_amount_cents', kind: 'number', label: 'Minimum Amount (cents)', hint: 'Hide low-value Stripe checkouts below this amount.' },
      { key: 'promo_credit_percent', kind: 'number', label: 'Promo Credits %', hint: 'Bonus credits added on wallet top-ups paid with Stripe.' },
    ],
    async isEnabled() {
      return !!stripeService.isEnabled;
    },
    async createSubscriptionCheckout({ user, checkoutOffering }) {
      const { url } = await stripeService.createCheckoutSession(user, checkoutOffering);
      return { payment_provider: 'stripe', checkout_url: url };
    },
  },
  {
    id: 'paygate',
    label: 'PayGate',
    admin_description: 'One-time crypto payments via BTC, ETH, LTC. No auto-renewal.',
    customer_description: 'Instant activation via BTC/ETH/LTC',
    customer_subtitle: 'BTC / ETH / LTC',
    icon: 'wallet',
    accent_color: 'emerald',
    supports: {
      subscription: true,
      topup: true,
      recurring: false,
    },
    defaults: {
      enabled: false,
      visible: false,
      wallet_address: '',
      api_key: '',
      minimum_amount_cents: 0,
      promo_credit_percent: 0,
    },
    fields: [
      { key: 'wallet_address', kind: 'text', label: 'Wallet Address', placeholder: '0x...', hint: 'Your receiving wallet address on PayGate.to' },
      { key: 'api_key', kind: 'secret', label: 'API Key', placeholder: 'pg_...', hint: 'Webhook endpoint: /webhooks/paygate', sensitive: true },
      { key: 'minimum_amount_cents', kind: 'number', label: 'Minimum Amount (cents)', hint: 'Lowest order or top-up amount allowed through PayGate.' },
      { key: 'promo_credit_percent', kind: 'number', label: 'Promo Credits %', hint: 'Bonus credits added after PayGate top-up confirmation.' },
    ],
    async isEnabled() {
      return !!paygateService.isEnabled;
    },
    async createSubscriptionCheckout({ user, offering, selectedPlan }) {
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
        await subscriptionQueries.update(sub.id, { status: 'cancelled', cancelled_at: new Date() });
        logger.error('[PayGate checkout] Session creation failed:', err.message);
        const outErr = new Error('Failed to create PayGate session. Please try again.');
        outErr.status = 502;
        throw outErr;
      }

      await subscriptionQueries.update(sub.id, { paygate_address_in: session.addressIn });

      return {
        payment_provider: 'paygate',
        checkout_url: paygateService.buildCheckoutUrl(session.addressIn, {
          amountCents: selectedPlan.price_cents,
          currency: selectedPlan.currency || offering.currency || 'USD',
          email: user.email,
        }),
        subscription_id: sub.id,
        address_in: session.addressIn,
      };
    },
    async createTopupCheckout({ user, amountCents, creditedAmountCents, promoCreditPercent }) {
      const tx = await creditService.createPendingTopup(user.id, creditedAmountCents, {
        type: 'topup_paygate',
        description: getTopupDescription(this, amountCents, creditedAmountCents, promoCreditPercent),
      });
      const invoiceId = `cred_${tx.id}`;
      const callbackBase = `${process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:3001'}/webhooks/paygate`;

      let session;
      try {
        session = await paygateService.createPaymentSession(invoiceId, callbackBase);
      } catch (err) {
        await pool.query(`UPDATE credit_transactions SET status = 'failed' WHERE id = $1`, [tx.id]);
        logger.error('[Credits topup/PayGate] Session failed:', err.message);
        const outErr = new Error('Failed to create PayGate session. Please try again.');
        outErr.status = 502;
        throw outErr;
      }

      await pool.query(`UPDATE credit_transactions SET reference_id = $1 WHERE id = $2`, [invoiceId, tx.id]);

      return {
        payment_provider: 'paygate',
        checkout_url: paygateService.buildCheckoutUrl(session.addressIn, {
          amountCents,
          currency: 'USD',
          email: user.email,
        }),
        address_in: session.addressIn,
        credit_transaction_id: tx.id,
      };
    },
  },
  {
    id: 'helcim',
    label: 'Helcim',
    admin_description: 'One-time card payments via myhelcim.com. No auto-renewal.',
    customer_description: 'Credit or debit card via Helcim',
    customer_subtitle: 'Credit / debit card',
    icon: 'credit-card',
    accent_color: 'sky',
    supports: {
      subscription: true,
      topup: true,
      recurring: false,
    },
    defaults: {
      enabled: false,
      visible: false,
      api_token: '',
      webhook_secret: '',
      company_name: '',
      minimum_amount_cents: 0,
      promo_credit_percent: 0,
    },
    fields: [
      { key: 'api_token', kind: 'secret', label: 'API Token', placeholder: 'helcim_api_...', hint: 'myHelcim Dashboard → Integrations → API', sensitive: true },
      { key: 'webhook_secret', kind: 'secret', label: 'Webhook Secret', placeholder: 'whsec_...', hint: 'Webhook endpoint: /webhooks/helcim', sensitive: true },
      { key: 'company_name', kind: 'text', label: 'Company Name (optional)', placeholder: 'Your Company' },
      { key: 'minimum_amount_cents', kind: 'number', label: 'Minimum Amount (cents)', hint: 'Lowest order or top-up amount allowed through Helcim.' },
      { key: 'promo_credit_percent', kind: 'number', label: 'Promo Credits %', hint: 'Bonus credits added after Helcim top-up confirmation.' },
    ],
    async isEnabled() {
      return !!helcimService.isEnabled;
    },
    async createSubscriptionCheckout({ user, offering, selectedPlan }) {
      const sub = await subscriptionQueries.create({
        user_id: user.id,
        offering_id: offering.id,
        status: 'pending_payment',
        payment_provider: 'helcim',
        current_period_start: new Date(),
        current_period_end: helcimService.calcPeriodEnd(selectedPlan.billing_period, selectedPlan.billing_interval_count),
        auto_renew: false,
        selected_plan_code: selectedPlan.code,
        selected_plan_name: selectedPlan.name,
        selected_price_cents: selectedPlan.price_cents,
        selected_currency: selectedPlan.currency,
        selected_billing_period: selectedPlan.billing_period,
        selected_interval_count: selectedPlan.billing_interval_count,
      });

      let session;
      try {
        session = await helcimService.initializePayment({
          amountCents: selectedPlan.price_cents,
          currency: selectedPlan.currency || offering.currency || 'USD',
          invoiceId: `sub_${sub.id}`,
          customerCode: user.id,
        });
      } catch (err) {
        await subscriptionQueries.update(sub.id, { status: 'cancelled', cancelled_at: new Date() });
        logger.error('[Helcim checkout] Initialize failed:', err.message);
        const outErr = new Error('Failed to initialize Helcim payment. Please try again.');
        outErr.status = 502;
        throw outErr;
      }

      await subscriptionQueries.update(sub.id, { helcim_checkout_token: session.checkoutToken });

      return {
        payment_provider: 'helcim',
        checkout_token: session.checkoutToken,
        subscription_id: sub.id,
      };
    },
    async createTopupCheckout({ user, amountCents, creditedAmountCents, promoCreditPercent }) {
      const tx = await creditService.createPendingTopup(user.id, creditedAmountCents, {
        type: 'topup_helcim',
        description: getTopupDescription(this, amountCents, creditedAmountCents, promoCreditPercent),
      });
      const invoiceId = `cred_${tx.id}`;
      await pool.query(`UPDATE credit_transactions SET reference_id = $1 WHERE id = $2`, [invoiceId, tx.id]);

      let session;
      try {
        session = await helcimService.initializePayment({
          amountCents,
          currency: 'USD',
          invoiceId,
          customerCode: user.id,
        });
      } catch (err) {
        await pool.query(`UPDATE credit_transactions SET status = 'failed' WHERE id = $1`, [tx.id]);
        logger.error('[Credits topup/Helcim] Initialize failed:', err.message);
        const outErr = new Error('Failed to initialize Helcim payment. Please try again.');
        outErr.status = 502;
        throw outErr;
      }

      return {
        payment_provider: 'helcim',
        checkout_token: session.checkoutToken,
        credit_transaction_id: tx.id,
      };
    },
  },
  {
    id: 'square',
    label: 'Square',
    admin_description: 'One-time card payments via Square checkout. No auto-renewal.',
    customer_description: 'Credit or debit card via Square',
    customer_subtitle: 'Credit / debit card',
    icon: 'shopping-cart',
    accent_color: 'teal',
    supports: {
      subscription: true,
      topup: true,
      recurring: false,
    },
    defaults: {
      enabled: false,
      visible: false,
      access_token: '',
      location_id: '',
      webhook_signature_key: '',
      environment: 'production',
      minimum_amount_cents: 0,
      promo_credit_percent: 0,
    },
    fields: [
      { key: 'access_token', kind: 'secret', label: 'Access Token', placeholder: 'EAAAl...', hint: 'Square Developer Dashboard → Credentials → Production Access Token', sensitive: true },
      { key: 'location_id', kind: 'text', label: 'Location ID', placeholder: 'L1234567890...', hint: 'Square Dashboard → Locations' },
      { key: 'webhook_signature_key', kind: 'secret', label: 'Webhook Signature Key', placeholder: 'signature_key_...', hint: 'Webhook endpoint: /webhooks/square  ·  Subscribe to: payment.updated', sensitive: true },
      { key: 'environment', kind: 'choice', label: 'Environment', options: ['production', 'sandbox'] },
      { key: 'minimum_amount_cents', kind: 'number', label: 'Minimum Amount (cents)', hint: 'Lowest order or top-up amount allowed through Square.' },
      { key: 'promo_credit_percent', kind: 'number', label: 'Promo Credits %', hint: 'Bonus credits added after Square top-up confirmation.' },
    ],
    async isEnabled() {
      return squareService.isEnabled();
    },
    async createSubscriptionCheckout({ user, checkoutOffering, offering, selectedPlan }) {
      const sub = await subscriptionQueries.create({
        user_id: user.id,
        offering_id: offering.id,
        status: 'pending_payment',
        payment_provider: 'square',
        current_period_start: new Date(),
        current_period_end: squareService.calcPeriodEnd(selectedPlan.billing_period, selectedPlan.billing_interval_count),
        auto_renew: false,
        selected_plan_code: selectedPlan.code,
        selected_plan_name: selectedPlan.name,
        selected_price_cents: selectedPlan.price_cents,
        selected_currency: selectedPlan.currency,
        selected_billing_period: selectedPlan.billing_period,
        selected_interval_count: selectedPlan.billing_interval_count,
      });

      let link;
      try {
        link = await squareService.createPaymentLink(user, checkoutOffering, { subscriptionId: sub.id });
      } catch (err) {
        await subscriptionQueries.update(sub.id, { status: 'cancelled', cancelled_at: new Date() });
        logger.error('[Square checkout] createPaymentLink failed', {
          message: err.message,
          squareErrors: err.squareErrors || null,
          cause: err.cause?.message || err.cause || null,
        });
        const outErr = new Error('Failed to create Square payment link. Please try again.');
        outErr.status = 502;
        throw outErr;
      }

      await subscriptionQueries.update(sub.id, {
        square_order_id: link.orderId,
        square_payment_link_id: link.paymentLinkId,
      });

      return {
        payment_provider: 'square',
        checkout_url: link.url,
        subscription_id: sub.id,
      };
    },
    async createTopupCheckout({ user, amountCents, creditedAmountCents, promoCreditPercent }) {
      const tx = await creditService.createPendingTopup(user.id, creditedAmountCents, {
        type: 'topup_square',
        description: getTopupDescription(this, amountCents, creditedAmountCents, promoCreditPercent),
      });
      const invoiceId = `cred_${tx.id}`;
      const squareReferenceId = `cred_${tx.id.replace(/-/g, '')}`;
      await pool.query(`UPDATE credit_transactions SET reference_id = $1 WHERE id = $2`, [invoiceId, tx.id]);

      const fakeOffering = {
        name: 'Credit Top-up',
        selected_plan: { price_cents: amountCents, currency: 'USD', name: `$${(amountCents / 100).toFixed(2)}` },
        price_cents: amountCents,
        currency: 'USD',
      };

      let link;
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        link = await squareService.createPaymentLink(user, fakeOffering, {
          referenceId: squareReferenceId,
          redirectUrl: `${frontendUrl}/marketplace?topup=success`,
        });
      } catch (err) {
        await pool.query(`UPDATE credit_transactions SET status = 'failed' WHERE id = $1`, [tx.id]);
        logger.error('[Credits topup/Square] Payment link failed', {
          message: err.message,
          squareErrors: err.squareErrors || null,
          cause: err.cause?.message || err.cause || null,
        });
        const outErr = new Error('Failed to create Square payment link. Please try again.');
        outErr.status = 502;
        throw outErr;
      }

      await pool.query(`UPDATE credit_transactions SET square_order_id = $1 WHERE id = $2`, [link.orderId, tx.id]);

      return {
        payment_provider: 'square',
        checkout_url: link.url,
        credit_transaction_id: tx.id,
      };
    },
  },
];

const PAYMENT_PROVIDER_MAP = Object.fromEntries(PAYMENT_PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider]));

function listProviders() {
  return PAYMENT_PROVIDER_DEFINITIONS;
}

function getProvider(providerId) {
  return PAYMENT_PROVIDER_MAP[providerId] || null;
}

function getProviderIds() {
  return PAYMENT_PROVIDER_DEFINITIONS.map((provider) => provider.id);
}

module.exports = {
  listProviders,
  getProvider,
  getProviderIds,
};
