/**
 * Unit tests for providerService
 */

jest.mock('node-fetch');
jest.mock('../../src/db/queries', () => ({
  providerNetworkQueries: {
    listAllHosts: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    addHosts: jest.fn().mockResolvedValue(),
    touchCatalogRefresh: jest.fn().mockResolvedValue(),
  },
  canonicalContentQueries: {
    resolveEntries: jest.fn(async (entries) => entries),
    getCoverage: jest.fn().mockResolvedValue({ canonical_count: '0', externally_matched_count: '0' }),
  },
  providerQueries: {
    create: jest.fn(),
    findByIdAndUser: jest.fn(),
    updateHealth: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateSyncWatermark: jest.fn().mockResolvedValue(),
    findByIdForCrm: jest.fn(),
    updateCrmSync: jest.fn(),
  },
  vodQueries: {
    upsertBatch: jest.fn().mockResolvedValue(),
    upsertNetworkBatch: jest.fn().mockResolvedValue(),
    deleteByProvider: jest.fn().mockResolvedValue(),
    deleteByNetwork: jest.fn().mockResolvedValue(),
  },
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  },
}));

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() }));

const fetch = require('node-fetch');
const { Response } = jest.requireActual('node-fetch');
const { providerQueries, providerNetworkQueries, canonicalContentQueries, vodQueries, pool } = require('../../src/db/queries');
const cache = require('../../src/utils/cache');
const providerService = require('../../src/services/providerService');

describe('providerService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('normalizes hosts (strips trailing slash) and creates provider', async () => {
      providerQueries.create.mockResolvedValue({ id: 'p1', name: 'Test', hosts: ['http://host1.com'] });
      providerNetworkQueries.listAllHosts.mockResolvedValue([]);
      providerNetworkQueries.create.mockResolvedValue({ id: 'network-1' });

      const result = await providerService.create('user-1', {
        name: 'Test',
        hosts: ['http://host1.com/', 'http://host2.com///'],
        username: 'user',
        password: 'pass',
      });

      expect(providerQueries.create).toHaveBeenCalledWith(expect.objectContaining({
        hosts: ['http://host1.com', 'http://host2.com'],
        networkId: 'network-1',
      }));
      expect(result).toMatchObject({ id: 'p1' });
    });

    it('attaches to an existing network when credentials work on a known host', async () => {
      providerNetworkQueries.listAllHosts.mockResolvedValue([
        { provider_network_id: 'network-42', host_url: 'http://known-host.com' },
      ]);
      providerNetworkQueries.findById.mockResolvedValue({ id: 'network-42' });
      providerQueries.create.mockResolvedValue({ id: 'p2', network_id: 'network-42' });
      fetch.mockResolvedValue(new Response(
        JSON.stringify({ user_info: { auth: 1, username: 'user' } }),
        { status: 200 }
      ));

      await providerService.create('user-1', {
        name: 'Test',
        hosts: ['http://new-brand.com/'],
        username: 'user',
        password: 'pass',
      });

      expect(providerQueries.create).toHaveBeenCalledWith(expect.objectContaining({
        networkId: 'network-42',
      }));
    });
  });

  describe('testConnection', () => {
    it('reuses cached account lookups for identical host credentials', async () => {
      const cachedResult = { ok: false, error: 'HTTP 429' };
      cache.get.mockReturnValueOnce(cachedResult);

      const result = await providerService.testConnection('http://host.com', 'user', 'pass');

      expect(result).toBe(cachedResult);
      expect(fetch).not.toHaveBeenCalled();
    });

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
      expect(cache.set).toHaveBeenCalled();
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
      expect(result.canonicalCoverage).toEqual({ canonical_count: '0', externally_matched_count: '0' });
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

  describe('refreshCatalog', () => {
    // Reusable provider stubs
    const baseProvider = {
      id: 'provider-1',
      user_id: 'user-1',
      name: 'Provider One',
      hosts: ['http://host.com'],
      active_host: 'http://host.com',
      username: 'user',
      password: 'pass',
      network_id: null,
      catalog_variant: false,
      incremental_sync: false,
      last_sync_watermark: null,
    };

    // Mock fetch for a category call + vod/series streams, then spy live streams
    function mockFetchForCatalog({ movies = [], series = [] } = {}) {
      fetch
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '1', name: 'Action' }]), { status: 200 })) // vod categories
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '1', name: 'Drama' }]), { status: 200 }))  // series categories
        .mockResolvedValueOnce(new Response(JSON.stringify(movies), { status: 200 }))                        // get_vod_streams
        .mockResolvedValueOnce(new Response(JSON.stringify(series), { status: 200 }));                       // get_series
    }

    it('deletes stale provider rows when a refresh returns no titles', async () => {
      providerQueries.findByIdAndUser.mockResolvedValue(baseProvider);
      mockFetchForCatalog();
      jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([]);

      const result = await providerService.refreshCatalog('provider-1', 'user-1');

      expect(vodQueries.deleteByProvider).toHaveBeenCalledWith('provider-1');
      expect(vodQueries.deleteByNetwork).not.toHaveBeenCalled();
      expect(vodQueries.upsertBatch).not.toHaveBeenCalled();
      expect(result).toMatchObject({ movies: 0, series: 0, live: 0, total: 0 });
    });

    describe('incremental sync', () => {
      it('captures remoteAddedAt from the added field on movies', async () => {
        providerQueries.findByIdAndUser.mockResolvedValue(baseProvider);
        mockFetchForCatalog({
          movies: [
            { stream_id: 1, name: 'Movie A', added: '1000000', category_id: '1', container_extension: 'mp4' },
          ],
        });
        jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([]);

        await providerService.refreshCatalog('provider-1', 'user-1');

        const upsertArgs = vodQueries.upsertBatch.mock.calls[0][0];
        expect(upsertArgs[0]).toMatchObject({ streamId: '1', remoteAddedAt: 1000000 });
      });

      it('captures remoteAddedAt from last_modified on series', async () => {
        providerQueries.findByIdAndUser.mockResolvedValue(baseProvider);
        mockFetchForCatalog({
          series: [
            { series_id: 10, name: 'Series A', last_modified: '2000000', category_id: '1' },
          ],
        });
        jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([]);

        await providerService.refreshCatalog('provider-1', 'user-1');

        const upsertArgs = vodQueries.upsertBatch.mock.calls[0][0];
        const series = upsertArgs.find(e => e.vodType === 'series');
        expect(series).toMatchObject({ streamId: '10', remoteAddedAt: 2000000 });
      });

      it('captures remoteAddedAt from added field on live channels', async () => {
        providerQueries.findByIdAndUser.mockResolvedValue(baseProvider);
        mockFetchForCatalog();
        jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([
          { streamId: '99', rawTitle: 'Channel A', vodType: 'live', providerId: 'provider-1', userId: 'user-1', remoteAddedAt: 5000000 },
        ]);

        await providerService.refreshCatalog('provider-1', 'user-1');

        const upsertArgs = vodQueries.upsertBatch.mock.calls[0][0];
        const live = upsertArgs.find(e => e.vodType === 'live');
        expect(live).toMatchObject({ streamId: '99', remoteAddedAt: 5000000 });
      });

      it('does NOT update watermark when incremental_sync is false (default)', async () => {
        providerQueries.findByIdAndUser.mockResolvedValue({ ...baseProvider, incremental_sync: false });
        mockFetchForCatalog({
          movies: [{ stream_id: 1, name: 'Movie A', added: '9999999', category_id: '1', container_extension: 'mp4' }],
        });
        jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([]);

        const result = await providerService.refreshCatalog('provider-1', 'user-1');

        expect(providerQueries.updateSyncWatermark).not.toHaveBeenCalled();
        expect(result.incremental).toBeNull();
      });

      it('resolves ALL entries on first incremental sync (no watermark yet)', async () => {
        providerQueries.findByIdAndUser.mockResolvedValue({
          ...baseProvider,
          network_id: 'network-1', // resolveEntries only runs when network_id is set
          incremental_sync: true,
          last_sync_watermark: null, // first run
        });
        mockFetchForCatalog({
          movies: [
            { stream_id: 1, name: 'Movie A', added: '1000', category_id: '1', container_extension: 'mp4' },
            { stream_id: 2, name: 'Movie B', added: '2000', category_id: '1', container_extension: 'mp4' },
          ],
        });
        jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([]);

        const result = await providerService.refreshCatalog('provider-1', 'user-1');

        // All entries should go through resolveEntries
        expect(canonicalContentQueries.resolveEntries).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ streamId: '1' }),
            expect.objectContaining({ streamId: '2' }),
          ]),
          expect.anything()
        );
        // Watermark set to max added timestamp
        expect(providerQueries.updateSyncWatermark).toHaveBeenCalledWith('provider-1', 'user-1', 2000);
        expect(result.incremental).toMatchObject({ resolved: 2, skipped: 0, watermark: 2000 });
      });

      it('only resolves entries newer than the watermark on subsequent syncs', async () => {
        providerQueries.findByIdAndUser.mockResolvedValue({
          ...baseProvider,
          network_id: 'network-1',
          incremental_sync: true,
          last_sync_watermark: 5000, // already synced up to t=5000
        });
        mockFetchForCatalog({
          movies: [
            { stream_id: 1, name: 'Old Movie',  added: '1000', category_id: '1', container_extension: 'mp4' }, // <= watermark
            { stream_id: 2, name: 'Old Movie 2', added: '5000', category_id: '1', container_extension: 'mp4' }, // == watermark, NOT new
            { stream_id: 3, name: 'New Movie',  added: '6000', category_id: '1', container_extension: 'mp4' }, // > watermark, NEW
          ],
        });
        jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([]);

        const result = await providerService.refreshCatalog('provider-1', 'user-1');

        // resolveEntries should only receive the new entry
        const resolveCall = canonicalContentQueries.resolveEntries.mock.calls[0][0];
        expect(resolveCall).toHaveLength(1);
        expect(resolveCall[0]).toMatchObject({ streamId: '3' });

        // All 3 entries still go to upsertNetworkBatch (network provider — for deletion detection too)
        const upsertArgs = vodQueries.upsertNetworkBatch.mock.calls[0][0];
        expect(upsertArgs).toHaveLength(3);

        // Watermark advances to the new max
        expect(providerQueries.updateSyncWatermark).toHaveBeenCalledWith('provider-1', 'user-1', 6000);
        expect(result.incremental).toMatchObject({ resolved: 1, skipped: 2, watermark: 6000 });
      });

      it('skips resolveEntries entirely when all entries are unchanged', async () => {
        providerQueries.findByIdAndUser.mockResolvedValue({
          ...baseProvider,
          network_id: 'network-1',
          incremental_sync: true,
          last_sync_watermark: 9999,
        });
        mockFetchForCatalog({
          movies: [
            { stream_id: 1, name: 'Old Movie', added: '1000', category_id: '1', container_extension: 'mp4' },
            { stream_id: 2, name: 'Old Movie 2', added: '2000', category_id: '1', container_extension: 'mp4' },
          ],
        });
        jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([]);

        const result = await providerService.refreshCatalog('provider-1', 'user-1');

        expect(canonicalContentQueries.resolveEntries).toHaveBeenCalledWith([], expect.anything());
        expect(result.incremental).toMatchObject({ resolved: 0, skipped: 2 });
      });

      it('treats entries with no remoteAddedAt as always needing resolution', async () => {
        providerQueries.findByIdAndUser.mockResolvedValue({
          ...baseProvider,
          network_id: 'network-1',
          incremental_sync: true,
          last_sync_watermark: 9999,
        });
        mockFetchForCatalog({
          movies: [
            { stream_id: 1, name: 'No Timestamp Movie', added: undefined, category_id: '1', container_extension: 'mp4' },
          ],
        });
        jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([]);

        await providerService.refreshCatalog('provider-1', 'user-1');

        // Entry without remoteAddedAt should always go to resolve
        const resolveCall = canonicalContentQueries.resolveEntries.mock.calls[0][0];
        expect(resolveCall).toHaveLength(1);
        expect(resolveCall[0]).toMatchObject({ streamId: '1', remoteAddedAt: null });
      });

      it('watermark does not advance if all entries lack remoteAddedAt', async () => {
        providerQueries.findByIdAndUser.mockResolvedValue({
          ...baseProvider,
          incremental_sync: true,
          last_sync_watermark: 5000,
        });
        mockFetchForCatalog({
          movies: [
            { stream_id: 1, name: 'Timestampless Movie', category_id: '1', container_extension: 'mp4' },
          ],
        });
        jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([]);

        await providerService.refreshCatalog('provider-1', 'user-1');

        // Watermark stays at previous value since no new timestamps were seen
        expect(providerQueries.updateSyncWatermark).toHaveBeenCalledWith('provider-1', 'user-1', 5000);
      });

      it('watermark advances to the highest remoteAddedAt across all stream types', async () => {
        providerQueries.findByIdAndUser.mockResolvedValue({
          ...baseProvider,
          incremental_sync: true,
          last_sync_watermark: 0,
        });
        mockFetchForCatalog({
          movies:  [{ stream_id: 1, name: 'Movie',  added: '3000', category_id: '1', container_extension: 'mp4' }],
          series:  [{ series_id: 2, name: 'Series', last_modified: '7000', category_id: '1' }],
        });
        jest.spyOn(providerService, 'getLiveStreams').mockResolvedValueOnce([
          { streamId: '3', rawTitle: 'Channel', vodType: 'live', providerId: 'provider-1', userId: 'user-1', remoteAddedAt: 5000 },
        ]);

        await providerService.refreshCatalog('provider-1', 'user-1');

        // 7000 is the max across movie(3000), live(5000), series(7000)
        expect(providerQueries.updateSyncWatermark).toHaveBeenCalledWith('provider-1', 'user-1', 7000);
      });
    });
  });
});
