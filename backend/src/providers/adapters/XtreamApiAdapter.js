/**
 * XtreamApiAdapter
 *
 * Handles providers that expose a standard Xtream Codes / Xtream UI REST API
 * for reseller operations.  No session scraping or captcha required.
 *
 * Used by: any provider with adapter_type = 'xtream_api'.
 */
const ProviderAdapter = require('../ProviderAdapter');
const providerService = require('../../services/providerService');
const logger = require('../../utils/logger');

class XtreamApiAdapter extends ProviderAdapter {
  constructor(network) {
    super(network);
    this._panelHost = network.reseller_portal_url;
    if (!this._panelHost) {
      throw new Error(`XtreamApiAdapter: network "${network.name}" has no reseller_portal_url`);
    }
    if (!network.reseller_username || !network.reseller_password) {
      throw new Error(`XtreamApiAdapter: network "${network.name}" has no reseller credentials`);
    }
  }

  async testConnection() {
    try {
      const result = await providerService.xtreamResellerRequest(
        this._panelHost,
        this.network.reseller_username,
        this.network.reseller_password,
        { action: 'get_server_info' }
      );
      const ok = Boolean(result && !result.error);
      return { success: ok, message: ok ? 'Connection successful' : (result?.error || 'Unknown error') };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async getBouquets() {
    const result = await providerService.xtreamResellerRequest(
      this._panelHost,
      this.network.reseller_username,
      this.network.reseller_password,
      { action: 'get_bouquets' }
    );
    if (!Array.isArray(result)) return [];
    return result.map((b) => ({ id: String(b.id), bouquet_name: b.bouquet_name }));
  }

  async createLine(opts) {
    return providerService.createResellerUser(
      this._panelHost,
      this.network.reseller_username,
      this.network.reseller_password,
      opts
    );
  }

  async editLine(username, opts) {
    const result = await providerService.xtreamResellerRequest(
      this._panelHost,
      this.network.reseller_username,
      this.network.reseller_password,
      { action: 'edit_user', username, ...opts }
    );
    const ok = result?.success !== false;
    return { success: ok, message: result?.message || (ok ? 'Updated' : 'Failed') };
  }

  async deleteLine(username) {
    const result = await providerService.xtreamResellerRequest(
      this._panelHost,
      this.network.reseller_username,
      this.network.reseller_password,
      { action: 'delete_user', username }
    );
    const ok = result?.success !== false;
    return { success: ok, message: result?.message || (ok ? 'Deleted' : 'Failed') };
  }
}

module.exports = XtreamApiAdapter;
