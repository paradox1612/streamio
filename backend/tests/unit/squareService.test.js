jest.mock('../../src/services/paymentProviderConfigService', () => ({
  getProvider: jest.fn(),
}));

const configService = require('../../src/services/paymentProviderConfigService');
const squareService = require('../../src/services/squareService');

describe('squareService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      FRONTEND_URL: 'https://streambridge.thekush.dev',
    };
    configService.getProvider.mockResolvedValue({
      access_token: 'sandbox-token',
      location_id: 'sandbox-location-id',
      environment: 'sandbox',
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        payment_link: {
          url: 'https://squareup.com/pay/debug',
          order_id: 'order-123',
          id: 'plink-123',
        },
      }),
    });
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('sends location_id at order.location_id when creating a payment link', async () => {
    const result = await squareService.createPaymentLink(
      { email: 'buyer@example.com' },
      {
        name: 'Starter Plan',
        price_cents: 999,
        currency: 'USD',
        selected_plan: {
          name: 'Monthly',
          price_cents: 999,
          currency: 'USD',
        },
      },
      { subscriptionId: 'sub-123' }
    );

    expect(result).toEqual({
      url: 'https://squareup.com/pay/debug',
      orderId: 'order-123',
      paymentLinkId: 'plink-123',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [requestUrl, requestOptions] = global.fetch.mock.calls[0];
    expect(requestUrl).toBe('https://connect.squareupsandbox.com/v2/online-checkout/payment-links');
    expect(requestOptions.method).toBe('POST');

    const payload = JSON.parse(requestOptions.body);
    expect(payload.order.location_id).toBe('sandbox-location-id');
    expect(payload.order.order).toBeUndefined();
    expect(payload.order.reference_id).toBe('sub_sub-123');
    expect(payload.order.line_items).toEqual([
      {
        name: 'Starter Plan — Monthly',
        quantity: '1',
        base_price_money: {
          amount: 999,
          currency: 'USD',
        },
      },
    ]);
    expect(payload.checkout_options.redirect_url).toBe(
      'https://streambridge.thekush.dev/subscriptions/provisioning?subscription_id=sub-123'
    );
  });
});
