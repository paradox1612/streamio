const { normalizePlanOptions } = require('../../src/utils/marketplacePlans');

describe('marketplace plan normalization', () => {
  it('inherits default bouquets when a plan does not define its own bouquet override', () => {
    const plans = normalizePlanOptions({
      price_cents: 999,
      billing_period: 'month',
      billing_interval_count: 1,
      reseller_bouquet_ids: ['default-1', 'default-2'],
      plan_options: [
        { code: 'plan_1', name: '1 Month', price_cents: 999, billing_period: 'month', billing_interval_count: 1 },
      ],
    });

    expect(plans[0].reseller_bouquet_ids).toEqual(['default-1', 'default-2']);
  });

  it('preserves plan-level bouquet overrides when provided', () => {
    const plans = normalizePlanOptions({
      price_cents: 999,
      billing_period: 'month',
      billing_interval_count: 1,
      reseller_bouquet_ids: ['default-1'],
      plan_options: [
        {
          code: 'plan_3',
          name: '3 Month',
          price_cents: 1999,
          billing_period: 'month',
          billing_interval_count: 3,
          reseller_bouquet_ids: ['sports', 'vod'],
        },
      ],
    });

    expect(plans[0].reseller_bouquet_ids).toEqual(['sports', 'vod']);
  });
});
