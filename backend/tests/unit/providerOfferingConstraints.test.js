const ProviderAdapterFactory = require('../../src/providers/ProviderAdapterFactory');
const { validateOfferingPlanConstraints } = require('../../src/utils/providerOfferingConstraints');

describe('provider offering plan constraints', () => {
  it('exposes gold panel constraints through the adapter factory', () => {
    const constraints = ProviderAdapterFactory.getOfferingPlanConstraints({
      name: 'Gold',
      adapter_type: 'gold_panel_api',
    });

    expect(constraints).toEqual({
      billing_period: {
        allowed_values: ['month'],
        locked: true,
      },
      billing_interval_count: {
        allowed_values: [1, 3, 6, 12],
        input: 'select',
      },
    });
  });

  it('accepts compliant plans', () => {
    expect(() => validateOfferingPlanConstraints([
      { code: 'plan_1', name: '1 Month', billing_period: 'month', billing_interval_count: 1 },
      { code: 'plan_2', name: '12 Months', billing_period: 'month', billing_interval_count: 12 },
    ], ProviderAdapterFactory.getOfferingPlanConstraints('gold_panel_api'))).not.toThrow();
  });

  it('rejects invalid billing periods with a 400-style validation error', () => {
    expect(() => validateOfferingPlanConstraints([
      { code: 'plan_1', name: '2 Days', billing_period: 'day', billing_interval_count: 2 },
    ], ProviderAdapterFactory.getOfferingPlanConstraints('gold_panel_api'))).toThrow(
      'Plan "2 Days" has invalid billing period "day". Allowed values: "month".'
    );
  });

  it('rejects invalid billing interval counts with a 400-style validation error', () => {
    expect(() => validateOfferingPlanConstraints([
      { code: 'plan_1', name: '2 Months', billing_period: 'month', billing_interval_count: 2 },
    ], ProviderAdapterFactory.getOfferingPlanConstraints('gold_panel_api'))).toThrow(
      'Plan "2 Months" has invalid billing interval count "2". Allowed values: "1", "3", "6", "12".'
    );
  });
});
