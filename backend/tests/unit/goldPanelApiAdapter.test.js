const GoldPanelApiAdapter = require('../../src/providers/adapters/GoldPanelApiAdapter');

describe('GoldPanelApiAdapter', () => {
  const network = {
    id: 'network-1',
    name: 'Gold',
    reseller_portal_url: 'https://gold.example.com/api',
    reseller_api_key: 'api-key-1',
  };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('uses the plan package id as the pack value when provisioning', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ status: 'true', message: 'ok', url: 'https://panel.example.com/get.php?username=u1&password=p1&type=m3u_plus' }],
    });

    const adapter = new GoldPanelApiAdapter(network);
    await adapter.createLine({
      billingPeriod: 'month',
      billingIntervalCount: 3,
      packageId: 'pkg-3m',
      bouquetIds: ['legacy-bouquet'],
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestUrl.searchParams.get('sub')).toBe('3');
    expect(requestUrl.searchParams.get('pack')).toBe('pkg-3m');
  });

  it('exposes the stored Gold package catalog for marketplace dropdowns', async () => {
    const adapter = new GoldPanelApiAdapter({
      ...network,
      gold_package_catalog: [
        { id: '101', name: '1 Month', billing_interval_count: 1 },
        { id: '103', name: '6 Months', billing_interval_count: 6 },
      ],
    });

    await expect(adapter.getPackages()).resolves.toEqual([
      { id: '101', name: '1 Month', billing_period: 'month', billing_interval_count: 1 },
      { id: '103', name: '6 Months', billing_period: 'month', billing_interval_count: 6 },
    ]);
  });

  it('falls back to the first bouquet id when no plan package id is provided', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ status: 'true', message: 'ok', url: 'https://panel.example.com/get.php?username=u2&password=p2&type=m3u_plus' }],
    });

    const adapter = new GoldPanelApiAdapter(network);
    await adapter.createLine({
      billingPeriod: 'month',
      billingIntervalCount: 1,
      bouquetIds: ['legacy-bouquet'],
    });

    const requestUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestUrl.searchParams.get('pack')).toBe('legacy-bouquet');
  });
});
