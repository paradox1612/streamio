jest.mock('node-fetch', () => jest.fn());

describe('paygateService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      PAYGATE_ENABLED: 'true',
      PAYGATE_WALLET_ADDRESS: '0xE2Ce9BD98D4193b9fabd90A165cf8AF5cC1910b0',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates a PayGate session using the configured wallet address', async () => {
    const fetch = require('node-fetch');
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        address_in: 'track_123',
        polygon_address_in: 'polygon_track_123',
      }),
    });

    const paygateService = require('../../src/services/paygateService');
    const session = await paygateService.createPaymentSession(
      'sub_test_1',
      'https://stream.example.com/webhooks/paygate'
    );

    expect(session).toEqual({
      addressIn: 'track_123',
      polygonAddressIn: 'polygon_track_123',
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [requestUrl] = fetch.mock.calls[0];
    const url = new URL(requestUrl);

    expect(url.origin).toBe('https://api.paygate.to');
    expect(url.pathname).toBe('/control/wallet.php');
    expect(url.searchParams.get('address')).toBe('0xE2Ce9BD98D4193b9fabd90A165cf8AF5cC1910b0');

    const callback = new URL(url.searchParams.get('callback'));
    expect(callback.origin).toBe('https://stream.example.com');
    expect(callback.pathname).toBe('/webhooks/paygate');
    expect(callback.searchParams.get('invoice_id')).toBe('sub_test_1');
    expect(callback.searchParams.get('sig')).toBeTruthy();
  });

  it('builds a hosted checkout URL from the tracking address', () => {
    const fetch = require('node-fetch');
    fetch.mockReset();
    const paygateService = require('../../src/services/paygateService');
    const checkoutUrl = paygateService.buildCheckoutUrl('track_123', {
      amountCents: 1299,
      currency: 'usd',
      email: 'test@example.com',
    });

    const url = new URL(checkoutUrl);
    expect(url.origin).toBe('https://checkout.paygate.to');
    expect(url.pathname).toBe('/pay.php');
    expect(url.searchParams.get('address')).toBe('track_123');
    expect(url.searchParams.get('amount')).toBe('12.99');
    expect(url.searchParams.get('currency')).toBe('USD');
    expect(url.searchParams.get('email')).toBe('test@example.com');
  });

  it('avoids double-encoding a PayGate tracking address', () => {
    const paygateService = require('../../src/services/paygateService');
    const checkoutUrl = paygateService.buildCheckoutUrl('abc%3D%3D', {
      amountCents: 500,
      currency: 'USD',
    });

    const url = new URL(checkoutUrl);
    expect(url.searchParams.get('address')).toBe('abc==');
    expect(url.toString()).toContain('address=abc%3D%3D');
    expect(url.toString()).not.toContain('%253D');
  });
});
