const crypto = require('crypto');
const logger = require('../utils/logger');

// Note: DB config takes priority — use paymentProviderConfigService for visibility/enabled checks.
// This env-based flag is the static fallback used at module init time.
const HELCIM_ENABLED = process.env.HELCIM_ENABLED === 'true' && !!process.env.HELCIM_API_TOKEN;
const HELCIM_API_BASE = 'https://api.helcim.com/v2';

function helcimDisabledError() {
  const err = new Error('Helcim is not configured');
  err.status = 503;
  return err;
}

async function helcimFetch(endpoint, options = {}) {
  if (!HELCIM_ENABLED) throw helcimDisabledError();

  const url = `${HELCIM_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'api-token': process.env.HELCIM_API_TOKEN,
      ...(options.headers || {}),
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Helcim API returned non-JSON response: ${response.status}`);
  }

  if (!response.ok) {
    const msg = data?.errors?.[0] || data?.message || `Helcim API error: ${response.status}`;
    throw new Error(msg);
  }

  return data;
}

/**
 * Initialize a Helcim Pay checkout session.
 * Returns { checkoutToken, secretToken } — pass checkoutToken to the frontend.
 */
async function initializePayment({ amountCents, currency = 'USD', invoiceId, customerCode }) {
  const amount = parseFloat((amountCents / 100).toFixed(2));

  const data = await helcimFetch('/helcim-pay/initialize', {
    method: 'POST',
    body: JSON.stringify({
      paymentType: 'purchase',
      amount,
      currency: currency.toUpperCase(),
      invoiceNumber: invoiceId,
      customerCode: customerCode || invoiceId,
      companyName: process.env.HELCIM_COMPANY_NAME || 'StreamIO',
    }),
  });

  if (!data.checkoutToken) {
    throw new Error('Helcim did not return a checkoutToken');
  }

  return { checkoutToken: data.checkoutToken, secretToken: data.secretToken || null };
}

/**
 * Verify a Helcim webhook HMAC-SHA256 signature.
 * Helcim signs the raw request body with HELCIM_WEBHOOK_SECRET.
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.HELCIM_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;

  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.replace(/^sha256=/, ''), 'hex'),
      Buffer.from(computed, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Calculate subscription period end date from billing period + interval.
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
  isEnabled: HELCIM_ENABLED,
  initializePayment,
  verifyWebhookSignature,
  calcPeriodEnd,
};
