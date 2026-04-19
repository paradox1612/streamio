/**
 * ProviderAdapter — abstract base class for IPTV provider integrations.
 *
 * Each provider type (Xtream UI scraper, Xtream REST API, M3U, etc.) extends
 * this class and implements the methods below.  The subscriptionService calls
 * ProviderAdapterFactory.create(network) to get the right adapter, then calls
 * the standard interface without caring which backend it is talking to.
 *
 * Adding a new provider:
 *   1. Create backend/src/providers/adapters/YourAdapter.js extending ProviderAdapter.
 *   2. Register it in ProviderAdapterFactory.js.
 *   3. Set adapter_type = 'your_type' on the provider_networks row.
 */
class ProviderAdapter {
  static getOfferingPlanConstraints() {
    return null;
  }

  /**
   * @param {object} network  Row from provider_networks (includes adapter_type,
   *                          reseller_portal_url, reseller_username, reseller_password,
   *                          reseller_session_cookie, hosts[], etc.)
   */
  constructor(network) {
    if (new.target === ProviderAdapter) {
      throw new Error('ProviderAdapter is abstract — use a concrete subclass');
    }
    this.network = network;
  }

  getOfferingPlanConstraints() {
    return this.constructor.getOfferingPlanConstraints();
  }

  async validateOfferingPlans() {
    return null;
  }

  /**
   * Verify that the stored credentials are valid and the panel is reachable.
   * Should resolve to { success: boolean, message?: string }.
   */
  async testConnection() {
    throw new Error(`${this.constructor.name}.testConnection() not implemented`);
  }

  /**
   * Return available bouquets / packages that can be assigned to a line.
   * Should resolve to Array<{ id: string, bouquet_name: string }>.
   */
  async getBouquets() {
    throw new Error(`${this.constructor.name}.getBouquets() not implemented`);
  }

  /**
   * Provision a new customer line.
   * @param {object} opts
   * @param {string} opts.username
   * @param {string} opts.password
   * @param {number} opts.maxConnections
   * @param {number|null} opts.expDate      Unix timestamp or null for no expiry
   * @param {string[]} opts.bouquetIds
   * @param {boolean} opts.trial
   * @param {string} opts.notes
   * Should resolve to { success: boolean, message?: string }.
   */
  async createLine(opts) {
    throw new Error(`${this.constructor.name}.createLine() not implemented`);
  }

  /**
   * Update an existing customer line (e.g. extend expiry, change bouquets).
   * @param {string} username  The line's username on the panel.
   * @param {object} opts      Same shape as createLine opts (only changed fields needed).
   * Should resolve to { success: boolean, message?: string }.
   */
  async editLine(username, opts) {
    throw new Error(`${this.constructor.name}.editLine() not implemented`);
  }

  /**
   * Delete / revoke a customer line from the panel.
   * @param {string} username
   * Should resolve to { success: boolean, message?: string }.
   */
  async deleteLine(username) {
    throw new Error(`${this.constructor.name}.deleteLine() not implemented`);
  }
}

module.exports = ProviderAdapter;
