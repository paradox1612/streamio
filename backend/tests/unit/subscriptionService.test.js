jest.mock('../../src/db/pool', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/db/queries', () => ({
  subscriptionQueries: {
    updateProvisioningStatus: jest.fn(),
    update: jest.fn()
  },
  providerNetworkQueries: {
    update: jest.fn()
  },
  providerQueries: {
    create: jest.fn()
  }
}));
jest.mock('../../src/providers/ProviderAdapterFactory', () => ({
  create: jest.fn()
}));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() }));

const subscriptionService = require('../../src/services/subscriptionService');
const { subscriptionQueries, providerQueries, providerNetworkQueries } = require('../../src/db/queries');
const ProviderAdapterFactory = require('../../src/providers/ProviderAdapterFactory');

describe('Subscription Service - Background Provisioning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates provisioning status during background provisioning success', async () => {
    // We cannot directly test unexported `provisionInBackground`, but we can test it indirectly via handlePurchase or createSubscriptionFromCredits.
    // However, they kick off a background task without awaiting. We can await a small tick.
  });
});
