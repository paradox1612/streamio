const mockFreeAccessQueries = {
  findActiveAssignmentForUser: jest.fn(),
  listRuntimeEligibleAccounts: jest.fn(),
  findProviderGroupById: jest.fn(),
  getHostsForGroup: jest.fn(),
  updateHostStatus: jest.fn(),
  updateAccountStatus: jest.fn(),
};

const mockProviderService = {
  testConnection: jest.fn(),
};

jest.mock('../../src/db/queries', () => ({
  freeAccessQueries: mockFreeAccessQueries,
}));

jest.mock('../../src/services/providerService', () => mockProviderService);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn() }));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn(), flush: jest.fn() }));

const freeAccessService = require('../../src/services/freeAccessService');

describe('freeAccessService.getActiveSourceForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the first source with at least one valid host login', async () => {
    mockFreeAccessQueries.findActiveAssignmentForUser.mockResolvedValue({
      id: 'assignment-1',
      account_id: 'assigned-account',
      provider_group_id: 'group-assigned',
    });
    mockFreeAccessQueries.listRuntimeEligibleAccounts.mockResolvedValue([
      { id: 'assigned-account', provider_group_id: 'group-assigned', username: 'u1', password: 'p1', status: 'assigned' },
      { id: 'fallback-account', provider_group_id: 'group-fallback', username: 'u2', password: 'p2', status: 'available' },
    ]);
    mockFreeAccessQueries.findProviderGroupById.mockImplementation(async (id) => ({
      id,
      is_active: true,
    }));
    mockFreeAccessQueries.getHostsForGroup.mockImplementation(async (groupId) => (
      groupId === 'group-assigned'
        ? [{ id: 'host-1', host: 'http://assigned-1' }, { id: 'host-2', host: 'http://assigned-2' }]
        : [{ id: 'host-3', host: 'http://fallback-1' }]
    ));
    mockProviderService.testConnection.mockImplementation(async (host) => {
      if (host === 'http://assigned-1') {
        return { ok: false, error: 'connect ECONNREFUSED' };
      }
      if (host === 'http://assigned-2') {
        return {
          ok: true,
          accountInfo: {
            status: 'Active',
            maxConnections: 1,
            activeConnections: 0,
            expiresAt: '2026-05-01T00:00:00.000Z',
          },
        };
      }
      return { ok: false, error: 'ETIMEDOUT' };
    });

    const result = await freeAccessService.getActiveSourceForUser('user-1');

    expect(result).toEqual({
      assignment: { id: 'assignment-1', account_id: 'assigned-account', provider_group_id: 'group-assigned' },
      providerGroup: { id: 'group-assigned', is_active: true },
      username: 'u1',
      password: 'p1',
      hosts: [{ host: 'http://assigned-2', responseTimeMs: expect.any(Number) }],
    });
    expect(mockFreeAccessQueries.updateAccountStatus).toHaveBeenCalledWith(
      'assigned-account',
      expect.objectContaining({
        status: 'assigned',
        maxConnections: 1,
        lastActiveConnections: 0,
      })
    );
  });

  it('stops checking hosts after the first usable login', async () => {
    mockFreeAccessQueries.findActiveAssignmentForUser.mockResolvedValue({
      id: 'assignment-1',
      account_id: 'account-1',
      provider_group_id: 'group-1',
    });
    mockFreeAccessQueries.listRuntimeEligibleAccounts.mockResolvedValue([
      { id: 'account-1', provider_group_id: 'group-1', username: 'u1', password: 'p1', status: 'assigned' },
    ]);
    mockFreeAccessQueries.findProviderGroupById.mockResolvedValue({ id: 'group-1', is_active: true });
    mockFreeAccessQueries.getHostsForGroup.mockResolvedValue([
      { id: 'host-1', host: 'http://alive-1' },
      { id: 'host-2', host: 'http://alive-2' },
    ]);
    mockProviderService.testConnection.mockResolvedValue({
      ok: true,
      accountInfo: {
        status: 'Active',
        maxConnections: 2,
        activeConnections: 0,
        expiresAt: '2026-05-01T00:00:00.000Z',
      },
    });

    const result = await freeAccessService.getActiveSourceForUser('user-1');

    expect(result.hosts).toHaveLength(1);
    expect(result.hosts[0].host).toBe('http://alive-1');
    expect(mockProviderService.testConnection).toHaveBeenCalledTimes(1);
  });

  it('does not mark the account invalid when all hosts are down', async () => {
    mockFreeAccessQueries.findActiveAssignmentForUser.mockResolvedValue({
      id: 'assignment-1',
      account_id: 'account-1',
      provider_group_id: 'group-1',
    });
    mockFreeAccessQueries.listRuntimeEligibleAccounts.mockResolvedValue([
      { id: 'account-1', provider_group_id: 'group-1', username: 'u1', password: 'p1', status: 'assigned' },
    ]);
    mockFreeAccessQueries.findProviderGroupById.mockResolvedValue({ id: 'group-1', is_active: true });
    mockFreeAccessQueries.getHostsForGroup.mockResolvedValue([
      { id: 'host-1', host: 'http://down-1' },
      { id: 'host-2', host: 'http://down-2' },
    ]);
    mockProviderService.testConnection
      .mockResolvedValueOnce({ ok: false, error: 'ETIMEDOUT' })
      .mockResolvedValueOnce({ ok: false, error: 'ECONNREFUSED' });

    const result = await freeAccessService.getActiveSourceForUser('user-1');

    expect(result).toBeNull();
    expect(mockFreeAccessQueries.updateAccountStatus).toHaveBeenCalledWith(
      'account-1',
      expect.objectContaining({
        status: 'assigned',
      })
    );
  });
});
