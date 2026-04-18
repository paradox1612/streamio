const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const configService = require('./paymentProviderConfigService');

const SQUARE_BASE = {
  production: 'https://connect.squareup.com/v2',
  sandbox: 'https://connect.squareupsandbox.com/v2',
};

async function getConfig() {
  const db = await configService.getProvider('square');
  const accessToken = db.access_token || process.env.SQUARE_ACCESS_TOKEN || null;
  const locationId = db.location_id || process.env.SQUARE_LOCATION_ID || null;
  const webhookSigKey = db.webhook_signature_key || process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || null;
  const environment = db.environment || process.env.SQUARE_ENVIRONMENT || 'production';
  const enabled = !!(accessToken && locationId);
  return { accessToken, locationId, webhookSigKey, environment, enabled };
}

async function isEnabled() {
  const cfg = await getConfig();
  return cfg.enabled;
}

async function squareFetch(endpoint, options = {}) {
  const cfg = await getConfig();
  if (!cfg.enabled) throw Object.assign(new Error('Square is not configured'), { status: 503 });

  const base = SQUARE_BASE[cfg.environment] || SQUARE_BASE.production;
  const url = `${base}${endpoint}`;

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.accessToken}`,
        'Square-Version': '2024-01-18',
        ...(options.headers || {}),
      },
    });
  } catch (netErr) {
    const cause = netErr.cause?.message || netErr.cause || '';
    throw new Error(`Square network error: ${netErr.message}${cause ? ` (${cause})` : ''}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Square API returned non-JSON response: ${response.status}`);
  }

  if (!response.ok) {
    const msg = data?.errors?.[0]?.detail || data?.errors?.[0]?.code || `Square API error: ${response.status}`;
    const err = new Error(msg);
    err.squareErrors = data?.errors;
    err.httpStatus = response.status;
    throw err;
  }

  return data;
}

/**
 * Create a Square payment link for a one-time purchase.
 * Returns { url, orderId, paymentLinkId }.
 */
async function createPaymentLink(user, offering, { subscriptionId } = {}) {
  const cfg = await getConfig();
  const selectedPlan = offering.selected_plan || offering;
  const amountCents = selectedPlan.price_cents || offering.price_cents;
  const currency = (selectedPlan.currency || offering.currency || 'USD').toUpperCase();
  const itemName = offering.name + (selectedPlan.name ? ` — ${selectedPlan.name}` : '');

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const redirectUrl = `${frontendUrl}/subscriptions/provisioning?subscription_id=${subscriptionId}`;

  const data = await squareFetch('/online-checkout/payment-links', {
    method: 'POST',
    body: JSON.stringify({
      idempotency_key: uuidv4(),
      order: {
        location_id: cfg.locationId,
        reference_id: `sub_${subscriptionId}`,
        line_items: [
          {
            name: itemName,
            quantity: '1',
            base_price_money: {
              amount: amountCents,
              currency,
            },
          },
        ],
      },
      checkout_options: {
        redirect_url: redirectUrl,
        allow_tipping: false,
        ask_for_shipping_address: false,
      },
      pre_populated_data: {
        buyer_email: user.email || undefined,
      },
    }),
  });

  const link = data.payment_link;
  if (!link?.url) throw new Error('Square did not return a payment link URL');

  return {
    url: link.url,
    orderId: link.order_id,
    paymentLinkId: link.id,
  };
}

/**
 * Verify a Square webhook HMAC-SHA256 signature.
 * Square signs: webhookNotificationUrl + rawBody
 */
async function verifyWebhookSignature(rawBody, signature, notificationUrl) {
  const cfg = await getConfig();
  const sigKey = cfg.webhookSigKey;
  if (!sigKey) return true; // permissive if no secret configured
  if (!signature) return false;

  const payload = notificationUrl + rawBody.toString('utf8');
  const computed = crypto
    .createHmac('sha256', sigKey)
    .update(payload)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(computed, 'base64')
    );
  } catch {
    return false;
  }
}

/**
 * Calculate subscription period end date.
 */
function calcPeriodEnd(billingPeriod, intervalCount = 1) {
  const end = new Date();
  const count = parseInt(intervalCount) || 1;
  if (billingPeriod === 'day') end.setDate(end.getDate() + count);
  else if (billingPeriod === 'month') end.setMonth(end.getMonth() + count);
  else if (billingPeriod === 'year') end.setFullYear(end.getFullYear() + count);
  return end;
}

module.exports = {
  isEnabled,
  getConfig,
  createPaymentLink,
  verifyWebhookSignature,
  calcPeriodEnd,
};
