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
