/**
 * ProviderAdapterFactory
 *
 * Returns the correct ProviderAdapter subclass for a given network row.
 * The adapter_type column on provider_networks controls which adapter is used.
 *
 * Supported adapter types:
 *   'xtream_ui_scraper' — session-based web scraping + 2Captcha (default, e.g. Starshare)
 *   'xtream_api'        — standard Xtream Codes REST API
 *   'gold_panel_api'    — API-key based provisioning API that returns M3U credentials
 *
 * To add a new provider type:
 *   1. Create backend/src/providers/adapters/YourAdapter.js extending ProviderAdapter.
 *   2. Add a case below mapping your adapter_type string to the new class.
 *   3. Set adapter_type = 'your_type' on the provider_networks row in the DB.
 */
const XtreamUiScraperAdapter = require('./adapters/XtreamUiScraperAdapter');
const XtreamApiAdapter = require('./adapters/XtreamApiAdapter');
const GoldPanelApiAdapter = require('./adapters/GoldPanelApiAdapter');

const ADAPTERS = {
  xtream_ui_scraper: XtreamUiScraperAdapter,
  xtream_api: XtreamApiAdapter,
  gold_panel_api: GoldPanelApiAdapter,
};

const ProviderAdapterFactory = {
  getAdapterClass(networkOrAdapterType) {
    const adapterType = typeof networkOrAdapterType === 'string'
      ? networkOrAdapterType
      : this.resolveAdapterType(networkOrAdapterType || {});

    return ADAPTERS[adapterType] || null;
  },

  resolveAdapterType(network = {}) {
    return network.adapter_type
      || (network.xtream_ui_scraped ? 'xtream_ui_scraper' : 'xtream_api');
  },

  /**
   * @param {object} network  Row from provider_networks.
   * @returns {ProviderAdapter}
   */
  create(network) {
    // Legacy fallback: if xtream_ui_scraped flag is set but adapter_type isn't,
    // treat it as a scraper network so existing rows work without migration.
    const adapterType = this.resolveAdapterType(network);

    const AdapterClass = this.getAdapterClass(adapterType);
    if (!AdapterClass) {
      throw new Error(
        `Unknown adapter_type "${adapterType}" for network "${network.name}". ` +
        `Supported types: ${Object.keys(ADAPTERS).join(', ')}`
      );
    }
    return new AdapterClass(network);
  },

  getOfferingPlanConstraints(networkOrAdapterType) {
    const adapterType = typeof networkOrAdapterType === 'string'
      ? networkOrAdapterType
      : this.resolveAdapterType(networkOrAdapterType || {});

    const AdapterClass = this.getAdapterClass(adapterType);
    if (!AdapterClass || typeof AdapterClass.getOfferingPlanConstraints !== 'function') {
      return null;
    }

    return AdapterClass.getOfferingPlanConstraints();
  },

  /** Returns all registered adapter type keys (useful for admin UI dropdowns). */
  supportedTypes() {
    return Object.keys(ADAPTERS);
  },
};

module.exports = ProviderAdapterFactory;
