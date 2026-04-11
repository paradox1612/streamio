const fetch = require('node-fetch');
const crypto = require('crypto');
const logger = require('../utils/logger');

const PAYGATE_ENABLED = process.env.PAYGATE_ENABLED === 'true' && !!process.env.PAYGATE_WALLET_ADDRESS;

function getWalletAddress() {
  return process.env.PAYGATE_WALLET_ADDRESS;
}

function normalizeCheckoutAddress(address) {
  if (!address) return address;

  // PayGate `address_in` values can already be URL-encoded when returned by
  // the session API. Decode once here so URLSearchParams does not encode `%`
  // again when building the hosted checkout URL.
  try {
    return decodeURIComponent(address);
  } catch {
    return address;
  }
}

/**
 * Generate HMAC signature for callback URL verification.
 * Uses the same algo as the PayGate.to PHP plugin reference implementation.
 */
function generateCallbackSig(invoiceId) {
  const secret = crypto
    .createHash('sha256')
    .update('paygate_salt_' + getWalletAddress())
    .digest('hex');
  return crypto.createHmac('sha256', secret).update(String(invoiceId)).digest('hex');
}

/**
 * Verify an inbound callback signature from PayGate.
 */
function verifyCallbackSig(invoiceId, sig) {
  if (!sig) return false;
  const expected = generateCallbackSig(invoiceId);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Register a new payment tracking session with PayGate.
 * Returns { addressIn, polygonAddressIn }.
 *
 * @param {string} invoiceId  - Your internal ID (subscription ID or credit tx ID)
 * @param {string} callbackBase - Full URL of your GET callback endpoint (without query params)
 */
async function createPaymentSession(invoiceId, callbackBase) {
  if (!PAYGATE_ENABLED) {
    const err = new Error('PayGate is not configured');
    err.status = 503;
    throw err;
  }

  const sig = generateCallbackSig(invoiceId);
  const callbackUrl = `${callbackBase}?invoice_id=${encodeURIComponent(invoiceId)}&sig=${sig}`;

  const url = new URL('https://api.paygate.to/control/wallet.php');
  url.searchParams.set('address', getWalletAddress());
  url.searchParams.set('callback', callbackUrl);

  logger.info(`[PayGate] Creating session for invoice ${invoiceId}`);
  const resp = await fetch(url.toString(), { timeout: 15000 });

  if (!resp.ok) {
    throw new Error(`PayGate wallet API returned ${resp.status}`);
  }

  const data = await resp.json();
  if (!data.address_in) {
    throw new Error('PayGate returned invalid session — check wallet address');
  }

  return {
    addressIn: data.address_in,
    polygonAddressIn: data.polygon_address_in || null,
  };
}

/**
 * Build the hosted checkout URL to redirect the customer to.
 *
 * @param {string} addressIn   - Tracking ID from createPaymentSession
 * @param {object} opts
 * @param {number} opts.amountCents  - Amount in cents
 * @param {string} opts.currency     - ISO currency code (USD, EUR, CAD, INR)
 * @param {string} opts.email        - Customer email
 * @param {string} [opts.logoUrl]    - Optional brand logo URL
 */
function buildCheckoutUrl(addressIn, { amountCents, currency = 'USD', email, logoUrl } = {}) {
  const url = new URL('https://checkout.paygate.to/pay.php');
  url.searchParams.set('address', normalizeCheckoutAddress(addressIn));
  url.searchParams.set('amount', (amountCents / 100).toFixed(2));
  url.searchParams.set('currency', currency.toUpperCase());
  if (email) url.searchParams.set('email', email);
  if (logoUrl) url.searchParams.set('logo', logoUrl);
  return url.toString();
}

/**
 * Fetch payment tracking status for a session.
 * Returns the raw PayGate tracking response.
 */
async function getPaymentStatus(addressIn) {
  const url = new URL('https://api.paygate.to/control/track.php');
  url.searchParams.set('address', addressIn);

  const resp = await fetch(url.toString(), { timeout: 10000 });
  if (!resp.ok) {
    throw new Error(`PayGate track API returned ${resp.status}`);
  }
  return resp.json();
}

/**
 * Calculate subscription period end date.
 * PayGate subscriptions are one-time payments — manual renewal required.
 */
function calcPeriodEnd(billingPeriod, intervalCount = 1) {
  const now = new Date();
  const count = Number.isFinite(parseInt(intervalCount, 10)) && parseInt(intervalCount, 10) > 0
    ? parseInt(intervalCount, 10)
    : 1;
  if (billingPeriod === 'year') {
    now.setFullYear(now.getFullYear() + count);
  } else if (billingPeriod === 'day') {
    now.setDate(now.getDate() + count);
  } else {
    now.setMonth(now.getMonth() + count);
  }
  return now;
}

module.exports = {
  isEnabled: PAYGATE_ENABLED,
  generateCallbackSig,
  verifyCallbackSig,
  createPaymentSession,
  buildCheckoutUrl,
  getPaymentStatus,
  calcPeriodEnd,
  normalizeCheckoutAddress,
};
