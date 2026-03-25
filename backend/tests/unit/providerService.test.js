/**
 * Unit tests for providerService
 */

jest.mock('node-fetch');
jest.mock('../../src/db/queries', () => ({
  providerQueries: {
    create: jest.fn(),
    findByIdAndUser: jest.fn(),
    updateHealth: jest.fn(),
  },
  vodQueries: {
    upsertBatch: jest.fn().mockResolvedValue(),
  },
}));

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const fetch = require('node-fetch');
const { Response } = jest.requireActual('node-fetch');
const { providerQueries } = require('../../src/db/queries');
const providerService = require('../../src/services/providerService');

describe('providerService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('normalizes hosts (strips trailing slash) and creates provider', async () => {
      providerQueries.create.mockResolvedValue({ id: 'p1', name: 'Test', hosts: ['http://host1.com'] });

      const result = await providerService.create('user-1', {
        name: 'Test',
        hosts: ['http://host1.com/', 'http://host2.com///'],
        username: 'user',
        password: 'pass',
      });

      expect(providerQueries.create).toHaveBeenCalledWith(expect.objectContaining({
        hosts: ['http://host1.com', 'http://host2.com'],
      }));
      expect(result).toMatchObject({ id: 'p1' });
    });
  });

  describe('testConnection', () => {
    it('returns ok:true when provider responds with valid user_info', async () => {
      fetch.mockResolvedValue(new Response(
        JSON.stringify({ user_info: { auth: 1, username: 'user', status: 'Active' }, server_info: {} }),
        { status: 200 }
      ));

      const result = await providerService.testConnection('http://host.com', 'user', 'pass');
      expect(result.ok).toBe(true);
      expect(result.host).toBe('http://host.com');
    });

    it('returns ok:false when credentials are invalid (auth=0)', async () => {
      fetch.mockResolvedValue(new Response(
        JSON.stringify({ user_info: { auth: 0, username: 'user' } }),
        { status: 200 }
      ));

      const result = await providerService.testConnection('http://host.com', 'bad', 'creds');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('returns ok:false when fetch throws (network error)', async () => {
      fetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await providerService.testConnection('http://dead-host.com', 'u', 'p');
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('returns ok:false when HTTP error response', async () => {
      fetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const result = await providerService.testConnection('http://host.com', 'bad', 'creds');
      expect(result.ok).toBe(false);
    });
  });

  describe('testProvider', () => {
    it('throws 404 if provider not found', async () => {
      providerQueries.findByIdAndUser.mockResolvedValue(null);

      await expect(providerService.testProvider('p-missing', 'u1')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('sets active host to first responding host', async () => {
      providerQueries.findByIdAndUser.mockResolvedValue({
        id: 'p1', name: 'Test',
        hosts: ['http://dead.com', 'http://alive.com'],
        username: 'u', password: 'p',
      });
      providerQueries.updateHealth.mockResolvedValue();

      // First host fails (network), second succeeds (valid user_info)
      fetch
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(new Response(
          JSON.stringify({ user_info: { auth: 1, username: 'u' } }),
          { status: 200 }
        ));

      const results = await providerService.testProvider('p1', 'u1');
      expect(results[0].ok).toBe(false);
      expect(results[1].ok).toBe(true);
      expect(providerQueries.updateHealth).toHaveBeenCalledWith('p1', {
        activeHost: 'http://alive.com',
        status: 'online',
      });
    });
  });
});
