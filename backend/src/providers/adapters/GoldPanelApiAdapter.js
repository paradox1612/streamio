const ProviderAdapter = require('../ProviderAdapter');

const SUPPORTED_SUBSCRIPTION_MONTHS = [1, 3, 6, 12];

function normalizeBoolean(value) {
  return String(value).trim().toLowerCase() === 'true';
}

function mapSubscriptionMonths(opts = {}) {
  const direct = parseInt(opts.subscriptionMonths || opts.sub || 0, 10);
  if (SUPPORTED_SUBSCRIPTION_MONTHS.includes(direct)) return direct;

  const intervalCount = parseInt(opts.billingIntervalCount || 0, 10);
  const billingPeriod = String(opts.billingPeriod || '').toLowerCase();
  if (billingPeriod === 'month' && SUPPORTED_SUBSCRIPTION_MONTHS.includes(intervalCount)) {
    return intervalCount;
  }

  if (opts.expDate) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const remainingDays = Math.max(0, Math.round((Number(opts.expDate) - nowSeconds) / 86400));
    if (remainingDays >= 330) return 12;
    if (remainingDays >= 165) return 6;
    if (remainingDays >= 75) return 3;
    if (remainingDays >= 21) return 1;
  }

  throw new Error('GOLD PANEL API supports only 1, 3, 6, or 12 month subscriptions');
}

function parsePlaylistCredentials(playlistUrl) {
  if (!playlistUrl) return {};
  const parsed = new URL(playlistUrl);
  const username = parsed.searchParams.get('username') || null;
  const password = parsed.searchParams.get('password') || null;
  return {
    username,
    password,
    host: parsed.origin,
    url: playlistUrl,
  };
}

class GoldPanelApiAdapter extends ProviderAdapter {
  static getOfferingPlanConstraints() {
    return {
      billing_period: {
        allowed_values: ['month'],
        locked: true,
      },
      billing_interval_count: {
        allowed_values: SUPPORTED_SUBSCRIPTION_MONTHS,
        input: 'select',
      },
    };
  }

  constructor(network) {
    super(network);
    this._apiUrl = network.reseller_portal_url;
    this._apiKey = network.reseller_api_key;

    if (!this._apiUrl) {
      throw new Error(`GoldPanelApiAdapter: network "${network.name}" has no reseller_portal_url`);
    }
    if (!this._apiKey) {
      throw new Error(`GoldPanelApiAdapter: network "${network.name}" has no reseller_api_key`);
    }
  }

  async request(params = {}) {
    const url = new URL(this._apiUrl);
    Object.entries({ ...params, api_key: this._apiKey }).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`GOLD PANEL request failed with ${response.status}`);
    }

    return response.json();
  }

  async testConnection() {
    try {
      const payload = await this.request({ action: 'reseller' });
      const entry = Array.isArray(payload) ? payload[0] : payload;
      const success = normalizeBoolean(entry?.status) && String(entry?.enabled || '1') === '1';
      return {
        success,
        message: success ? 'Connection successful' : (entry?.message || 'Reseller account is not enabled'),
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async getBouquets() {
    const payload = await this.request({ action: 'bouquet' });
    if (!Array.isArray(payload)) return [];
    return payload.map((entry) => ({
      id: String(entry.id),
      bouquet_name: String(entry.name || entry.bouquet_name || entry.id),
    }));
  }

  async getPackages() {
    const bouquets = await this.getBouquets();
    return bouquets.map((entry) => ({
      id: String(entry.id),
      name: String(entry.bouquet_name || entry.id),
    }));
  }

  async createLine(opts) {
    const subscriptionMonths = mapSubscriptionMonths(opts);
    const bouquetIds = Array.isArray(opts.bouquetIds) ? opts.bouquetIds.filter(Boolean) : [];
    const packageId = opts.packageId ? String(opts.packageId).trim() : '';
    const selectedPackage = packageId || bouquetIds[0] || '';
    if (!selectedPackage) {
      throw new Error('GOLD PANEL API requires a package ID or exactly one fallback bouquet/package selection');
    }

    const payload = await this.request({
      action: 'new',
      type: 'm3u',
      sub: subscriptionMonths,
      pack: selectedPackage,
      country: opts.country || undefined,
      notes: opts.notes || undefined,
    });

    const entry = Array.isArray(payload) ? payload[0] : payload;
    const success = normalizeBoolean(entry?.status);
    if (!success) {
      return { success: false, message: entry?.message || 'Failed to create M3U line' };
    }

    return {
      success: true,
      message: entry?.message || 'Add M3U successful',
      userId: entry?.user_id ? String(entry.user_id) : null,
      notes: entry?.notes || null,
      country: entry?.country || null,
      ...parsePlaylistCredentials(entry?.url || null),
    };
  }

  async editLine(username, opts) {
    if (!username || !opts?.password) {
      throw new Error('GOLD PANEL renew requires both username and password');
    }

    const subscriptionMonths = mapSubscriptionMonths(opts);
    const payload = await this.request({
      action: 'renew',
      type: 'm3u',
      username,
      password: opts.password,
      sub: subscriptionMonths,
    });

    const entry = Array.isArray(payload) ? payload[0] : payload;
    const success = normalizeBoolean(entry?.status);
    return {
      success,
      message: entry?.message || entry?.messasge || (success ? 'M3U renew successful' : 'Renew failed'),
    };
  }

  async deleteLine() {
    return {
      success: false,
      message: 'GOLD PANEL API does not support delete via this integration',
    };
  }
}

module.exports = GoldPanelApiAdapter;
