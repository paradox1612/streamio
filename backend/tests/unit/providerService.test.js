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
        JSON.stringify({
          user_info: {
            auth: 1,
            username: 'user',
            status: 'Active',
            exp_date: '1735689600',
            max_connections: '3',
            active_cons: '1',
            allowed_output_formats: ['ts', 'm3u8'],
          },
          server_info: { timezone: 'UTC', time_now: '2025-01-01 00:00:00' },
        }),
        { status: 200 }
      ));

      const result = await providerService.testConnection('http://host.com', 'user', 'pass');
      expect(result.ok).toBe(true);
      expect(result.host).toBe('http://host.com');
      expect(result.accountInfo).toMatchObject({
        status: 'Active',
        maxConnections: 3,
        activeConnections: 1,
        allowedOutputFormats: ['ts', 'm3u8'],
        serverTimezone: 'UTC',
      });
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

  describe('getStats', () => {
    it('includes normalized account info when live provider details are available', async () => {
      providerQueries.findByIdAndUser.mockResolvedValue({
        id: 'p1',
        user_id: 'u1',
        name: 'Provider One',
        hosts: ['http://host.com'],
        active_host: 'http://host.com',
        username: 'user',
        password: 'pass',
      });

      const { vodQueries } = require('../../src/db/queries');
      vodQueries.getStats = jest.fn().mockResolvedValue({ movie_count: 20, series_count: 5, category_count: 4, total: 25 });
      vodQueries.getMatchStats = jest.fn().mockResolvedValue({ total: 25, matched: 20, unmatched: 5 });
      vodQueries.getCategoryBreakdown = jest.fn().mockResolvedValue([]);

      fetch.mockResolvedValue(new Response(
        JSON.stringify({
          user_info: {
            auth: '1',
            status: 'Active',
            is_trial: '0',
            exp_date: '1735689600',
            created_at: '1704067200',
            max_connections: '4',
            active_cons: '2',
            allowed_output_formats: ['ts', 'm3u8'],
          },
          server_info: {
            timezone: 'America/Chicago',
            time_now: '2025-01-01 00:00:00',
            url: 'provider.example',
            port: '8080',
            https_port: '443',
          },
        }),
        { status: 200 }
      ));

      const result = await providerService.getStats('p1', 'u1', { includeAccountInfo: true });
      expect(result.accountInfo).toMatchObject({
        status: 'Active',
        isTrial: false,
        maxConnections: 4,
        activeConnections: 2,
        allowedOutputFormats: ['ts', 'm3u8'],
        serverTimezone: 'America/Chicago',
        url: 'provider.example',
        port: '8080',
      });
      expect(result.accountInfoError).toBeNull();
    });
  });

  describe('getLiveStreams', () => {
    it('preserves live channel categories when the provider returns non-standard category fields', async () => {
      providerQueries.findByIdAndUser.mockResolvedValue({
        id: 'p1',
        user_id: 'u1',
        name: 'Provider One',
        hosts: ['http://host.com'],
        active_host: 'http://host.com',
        username: 'user',
        password: 'pass',
      });

      fetch
        .mockResolvedValueOnce(new Response(
          JSON.stringify([
            { id: '55', name: 'Sports UK' },
          ]),
          { status: 200 }
        ))
        .mockResolvedValueOnce(new Response(
          JSON.stringify([
            {
              stream_id: 77,
              name: 'Sky Sports Main Event',
              category_id: '55',
              stream_icon: 'http://img.example.com/sky-sports.png',
              container_extension: 'ts',
              epg_channel_id: 'sky.sports.uk',
            },
            {
              stream_id: 88,
              name: 'BBC News',
              category: 'News',
              stream_icon: null,
              container_extension: 'm3u8',
            },
          ]),
          { status: 200 }
        ));

      const result = await providerService.getLiveStreams('p1', 'u1');

      expect(result).toEqual([
        expect.objectContaining({
          streamId: '77',
          category: 'Sports UK',
          vodType: 'live',
        }),
        expect.objectContaining({
          streamId: '88',
          category: 'News',
          vodType: 'live',
        }),
      ]);
    });
  });
});
