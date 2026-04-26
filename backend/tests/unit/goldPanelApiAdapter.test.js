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

  it('maps live bouquet results into package options for marketplace dropdowns', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 66599, name: 'full' }],
    });

    const adapter = new GoldPanelApiAdapter(network);

    await expect(adapter.getPackages()).resolves.toEqual([
      { id: '66599', name: 'full' },
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
