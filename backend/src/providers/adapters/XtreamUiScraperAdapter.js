/**
 * XtreamUiScraperAdapter
 *
 * Wraps xtreamUiScraper.js for panels that don't expose a standard REST API
 * and require a live browser session (PHPSESSID) obtained via 2Captcha.
 *
 * Used by: Starshare and any other provider with xtream_ui_scraped = true.
 *
 * Session lifecycle:
 *   - constructor accepts the current session cookie from provider_networks.reseller_session_cookie
 *   - ensureSession() validates / refreshes as needed before each operation
 *   - after a successful refresh the caller is responsible for persisting the
 *     new cookie back to the database (via providerNetworkQueries.update)
 */
const ProviderAdapter = require('../ProviderAdapter');
const xtreamUiScraper = require('../../utils/xtreamUiScraper');
const logger = require('../../utils/logger');

function buildValidationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function parsePackageBilling(name = '') {
  const normalized = String(name).trim();
  const match = normalized.match(/(\d+)\s*(day|days|month|months|year|years)\b/i);
  if (!match) return null;

  const count = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(count) || count <= 0) return null;

  if (unit.startsWith('day')) {
    return { billing_period: 'day', billing_interval_count: count };
  }
  if (unit.startsWith('month')) {
    return { billing_period: 'month', billing_interval_count: count };
  }
  if (unit.startsWith('year')) {
    return { billing_period: 'year', billing_interval_count: count };
  }

  return null;
}

class XtreamUiScraperAdapter extends ProviderAdapter {
  constructor(network) {
    super(network);
    this._sessionCookie = network.reseller_session_cookie || null;
    this._panelHost = network.reseller_portal_url;
    if (!this._panelHost) {
      throw new Error(`XtreamUiScraperAdapter: network "${network.name}" has no reseller_portal_url`);
    }
  }

  /** Returns the (possibly refreshed) session cookie.  Throws on failure. */
  async ensureSession() {
    if (this._sessionCookie) {
      const valid = await xtreamUiScraper.isSessionValid(this._panelHost, this._sessionCookie);
      if (valid) return this._sessionCookie;
      logger.info(`[XtreamUiScraperAdapter] Session expired for ${this._panelHost}, refreshing…`);
    }
    if (!this.network.reseller_username || !this.network.reseller_password) {
      throw new Error('Reseller username/password required for auto-login');
    }
    const newSession = await xtreamUiScraper.autoLogin(
      this._panelHost,
      this.network.reseller_username,
      this.network.reseller_password
    );
    this._sessionCookie = newSession;
    // Surface the new cookie so callers can persist it
    this.network.reseller_session_cookie = newSession;
    return newSession;
  }

  async testConnection() {
    try {
      const session = await this.ensureSession();
      const valid = await xtreamUiScraper.isSessionValid(this._panelHost, session);
      return { success: valid, message: valid ? 'Session valid' : 'Session invalid after refresh' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async getBouquets() {
    const session = await this.ensureSession();
    return xtreamUiScraper.getBouquets(this._panelHost, session);
  }

  async getPackages() {
    const session = await this.ensureSession();
    const packages = await xtreamUiScraper.getPackages(this._panelHost, session);
    return packages.map((pkg) => ({
      ...pkg,
      ...parsePackageBilling(pkg.name),
      is_trial: /\btrial\b/i.test(String(pkg.name || '')),
    }));
  }

  async validateOfferingPlans(planOptions = []) {
    if (!Array.isArray(planOptions) || planOptions.length === 0) return;

    const packages = await this.getPackages();
    const packageMap = new Map(packages.map((pkg) => [String(pkg.id), pkg]));

    planOptions.forEach((plan, index) => {
      const planLabel = `Plan "${plan?.name || plan?.code || `#${index + 1}`}"`;
      const isTrial = plan?.is_trial === true || Number(plan?.trial_days || 0) > 0;
      const packageId = plan?.reseller_package_id ? String(plan.reseller_package_id) : '';

      if (isTrial) return;
      if (!packageId) {
        throw buildValidationError(`${planLabel} requires a reseller package for scraper-based providers.`);
      }

      const selectedPackage = packageMap.get(packageId);
      if (!selectedPackage) {
        throw buildValidationError(`${planLabel} references unknown reseller package "${packageId}".`);
      }

      if (selectedPackage.billing_period && String(plan.billing_period) !== String(selectedPackage.billing_period)) {
        throw buildValidationError(
          `${planLabel} billing period "${plan.billing_period}" does not match reseller package "${selectedPackage.name}". Expected "${selectedPackage.billing_period}".`
        );
      }

      if (
        selectedPackage.billing_interval_count
        && String(plan.billing_interval_count) !== String(selectedPackage.billing_interval_count)
      ) {
        throw buildValidationError(
          `${planLabel} billing interval count "${plan.billing_interval_count}" does not match reseller package "${selectedPackage.name}". Expected "${selectedPackage.billing_interval_count}".`
        );
      }
    });
  }

  async createLine(opts) {
    const session = await this.ensureSession();
    return xtreamUiScraper.createLine(this._panelHost, session, opts);
  }

  async editLine(username, opts) {
    const session = await this.ensureSession();
    return xtreamUiScraper.editLine(this._panelHost, session, username, opts);
  }

  async deleteLine(username) {
    const session = await this.ensureSession();
    return xtreamUiScraper.deleteLine(this._panelHost, session, username);
  }
}

module.exports = XtreamUiScraperAdapter;
