jest.mock('node-fetch', () => jest.fn());

const mockProviderQueries = {
  getAllForHealthCheck: jest.fn(),
  updateHealth: jest.fn(),
  findById: jest.fn(),
};
const mockProviderNetworkQueries = {
  listHosts: jest.fn(),
};
const mockHostHealthQueries = {
  upsert: jest.fn(),
  getByProvider: jest.fn(),
};
const mockCache = {
  del: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};

jest.mock('../../src/db/queries', () => ({
  providerQueries: mockProviderQueries,
  providerNetworkQueries: mockProviderNetworkQueries,
  hostHealthQueries: mockHostHealthQueries,
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../src/utils/cache', () => mockCache);
jest.mock('../../src/services/providerService', () => ({
  getProviderAccountInfo: jest.fn().mockResolvedValue({ ok: true }),
}));

const fetch = require('node-fetch');
const hostHealthService = require('../../src/services/hostHealthService');

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

describe('hostHealthService.checkProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProviderNetworkQueries.listHosts.mockResolvedValue([]);
    mockProviderQueries.findById.mockResolvedValue(null);
  });

  it('marks a host offline when the Xtream response is unauthenticated', async () => {
    fetch.mockResolvedValue(
      createJsonResponse({ user_info: { auth: 0 } })
    );

    await hostHealthService.checkProvider({
      id: 'provider-1',
      name: 'Provider 1',
      hosts: ['http://host-1.test'],
      username: 'alice',
      password: 'secret',
    }, { force: true });

    expect(mockHostHealthQueries.upsert).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'provider-1',
      hostUrl: 'http://host-1.test',
      status: 'offline',
    }));
    expect(mockProviderQueries.updateHealth).toHaveBeenCalledWith('provider-1', {
      activeHost: null,
      status: 'offline',
    });
  });

  it('selects the fastest authenticated active network host', async () => {
    mockProviderNetworkQueries.listHosts.mockResolvedValue([
      { host_url: 'http://inactive.test', is_active: false },
      { host_url: 'http://slow.test', is_active: true },
      { host_url: 'http://fast.test', is_active: true },
    ]);

    fetch
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(
        createJsonResponse({ user_info: { auth: 1 } })
      ), 20)))
      .mockImplementationOnce(() => Promise.resolve(
        createJsonResponse({ user_info: { auth: 1 } })
      ));

    await hostHealthService.checkProvider({
      id: 'provider-2',
      name: 'Provider 2',
      hosts: ['http://legacy.test'],
      network_id: 'network-1',
      username: 'alice',
      password: 'secret',
    }, { force: true });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('http://inactive.test'),
      expect.anything()
    );
    expect(mockProviderQueries.updateHealth).toHaveBeenCalledWith('provider-2', {
      activeHost: 'http://fast.test',
      status: 'online',
    });
  });
});
