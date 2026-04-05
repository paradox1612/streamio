jest.mock('node-fetch', () => jest.fn());

const mockTmdbQueries = {
  upsertMovie: jest.fn(),
  exactMatchMovie: jest.fn(),
  fuzzyMatchMovie: jest.fn(),
  exactMatchSeries: jest.fn(),
  fuzzyMatchSeries: jest.fn(),
};
const mockUserQueries = {
  findByToken: jest.fn(),
};
const mockProviderQueries = {
  findByUser: jest.fn(),
  findByIdAndUser: jest.fn(),
};
const mockVodQueries = {
  getCategoryBreakdown: jest.fn(),
  getByProvider: jest.fn(),
  findOnDemandCandidateForUser: jest.fn(),
  resolveByExternalIdForUser: jest.fn(),
  findByInternalIdForUser: jest.fn(),
};
const mockMatchQueries = {
  upsert: jest.fn(),
};
const mockWatchHistoryQueries = {
  upsertFromVod: jest.fn().mockResolvedValue(),
};
const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};
const mockHostHealthService = {
  getProviderHealth: jest.fn(),
  checkSingleProvider: jest.fn(),
};
const mockUserActivity = {
  touchUserLastSeen: jest.fn().mockResolvedValue(false),
};

jest.mock('../../src/db/queries', () => ({
  userQueries: mockUserQueries,
  providerQueries: mockProviderQueries,
  vodQueries: mockVodQueries,
  watchHistoryQueries: mockWatchHistoryQueries,
  tmdbQueries: mockTmdbQueries,
  matchQueries: mockMatchQueries,
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../src/services/providerService', () => ({}));
jest.mock('../../src/services/freeAccessService', () => ({
  resolveFallbackVodItem: jest.fn().mockResolvedValue(null),
  resolveFallbackVodItemsForStream: jest.fn().mockResolvedValue([]),
  resolveFallbackOnDemandCandidate: jest.fn().mockResolvedValue([]),
  recordResolvedStream: jest.fn().mockResolvedValue(),
}));
jest.mock('../../src/services/epgService', () => ({}));
jest.mock('../../src/services/hostHealthService', () => mockHostHealthService);
jest.mock('../../src/utils/userActivity', () => mockUserActivity);
jest.mock('../../src/utils/cache', () => mockCache);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/utils/loadManager', () => ({
  beginAddonRequest: jest.fn(),
  endAddonRequest: jest.fn(),
}));

process.env.TMDB_API_KEY = 'test-key';

const fetch = require('node-fetch');
const { pool } = require('../../src/db/queries');
const freeAccessService = require('../../src/services/freeAccessService');
const { buildManifest, handleCatalog, handleStream, __test__ } = require('../../src/addon/addonHandler');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('addonHandler getTargetTmdbRecord', () => {
  it('upserts movie metadata fetched from TMDB find fallback', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        movie_results: [{
          id: 875828,
          title: 'Peaky Blinders: The Immortal Man',
          original_title: 'Peaky Blinders: The Immortal Man',
          release_date: '2026-01-01',
          popularity: 12.3,
          poster_path: '/poster.jpg',
          overview: 'A follow-up film.',
        }],
      }),
    });

    const result = await __test__.getTargetTmdbRecord('tt15574124', 'movie');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/find/tt15574124?api_key=test-key&external_source=imdb_id'
    );
    expect(mockTmdbQueries.upsertMovie).toHaveBeenCalledWith({
      id: 875828,
      original_title: 'Peaky Blinders: The Immortal Man',
      normalized_title: 'peaky blinders the immortal man',
      release_year: 2026,
      popularity: 12.3,
      poster_path: '/poster.jpg',
      overview: 'A follow-up film.',
      imdb_id: 'tt15574124',
    });
    expect(result).toEqual({
      id: 875828,
      original_title: 'Peaky Blinders: The Immortal Man',
      normalized_title: 'peaky blinders the immortal man',
      year: 2026,
      imdb_id: 'tt15574124',
      tmdb_type: 'movie',
    });
  });
});

describe('addonHandler buildManifest', () => {
  it('adds live category options to provider live catalogs', async () => {
    mockCache.get.mockReturnValue(null);
    mockUserQueries.findByToken.mockResolvedValue({ id: 'user-1' });
    mockProviderQueries.findByUser.mockResolvedValue([{ id: '123e4567-e89b-12d3-a456-426614174000', name: 'Startshare' }]);
    mockVodQueries.getCategoryBreakdown.mockResolvedValue([
      { vod_type: 'live', category: 'Sports' },
      { vod_type: 'live', category: 'News' },
      { vod_type: 'movie', category: 'Action' },
      { vod_type: 'live', category: 'Sports' },
    ]);

    const manifest = await buildManifest('token-1');
    const liveCatalog = manifest.catalogs.find(c => c.id === 'sb_123e4567-e89b-12d3-a456-426614174000_live');

    expect(liveCatalog).toEqual(expect.objectContaining({
      type: 'tv',
      name: 'Startshare – Live TV',
    }));
    expect(liveCatalog.extra).toEqual([
      { name: 'search' },
      { name: 'skip' },
      { name: 'genre', options: ['News', 'Sports'] },
    ]);
  });
});

describe('addonHandler handleCatalog', () => {
  it('passes Stremio search extras through to provider lookup', async () => {
    mockCache.get.mockReturnValue(null);
    mockUserQueries.findByToken.mockResolvedValue({ id: 'user-1' });
    mockProviderQueries.findByIdAndUser.mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000', name: 'Startshare' });
    mockVodQueries.getByProvider.mockResolvedValue([]);

    await handleCatalog('token-1', 'movie', 'sb_123e4567-e89b-12d3-a456-426614174000_movies', { search: 'matrix', skip: '0' });

    expect(mockVodQueries.getByProvider).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
      expect.objectContaining({
        type: 'movie',
        search: 'matrix',
        page: 1,
        limit: 100,
      })
    );
  });

  it('filters live catalog results by selected Stremio genre', async () => {
    mockCache.get.mockReturnValue(null);
    mockUserQueries.findByToken.mockResolvedValue({ id: 'user-1' });
    mockProviderQueries.findByIdAndUser.mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000', name: 'Startshare' });
    mockVodQueries.getByProvider.mockResolvedValue([
      { id: '1', vod_type: 'live', raw_title: 'ATN', category: 'News', poster_url: null },
      { id: '2', vod_type: 'live', raw_title: 'ESPN', category: 'Sports', poster_url: null },
    ]);

    const result = await handleCatalog('token-1', 'tv', 'sb_123e4567-e89b-12d3-a456-426614174000_live', { genre: 'Sports' });

    expect(mockVodQueries.getByProvider).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', expect.objectContaining({
      type: 'live',
    }));
    expect(result).toEqual({
      metas: [
        expect.objectContaining({
          name: 'ESPN',
          genres: ['Sports'],
        }),
      ],
    });
  });
});

describe('addonHandler handleStream', () => {
  it('returns all matching movie variants with raw titles in the stream labels', async () => {
    mockCache.get.mockReturnValue(null);
    mockUserQueries.findByToken.mockResolvedValue({ id: 'user-1' });
    mockVodQueries.resolveByExternalIdForUser.mockResolvedValueOnce([
      {
        provider_id: 'provider-1',
        raw_title: 'Peaky Blinders: The Immortal Man (2026) (Hindi)',
        active_host: 'http://fallback-1.test',
        username: 'alice',
        password: 'secret',
        stream_id: '101',
        vod_type: 'movie',
        container_extension: 'mp4',
      },
      {
        provider_id: 'provider-2',
        raw_title: 'Peaky Blinders: The Immortal Man (2026) (Tamil)',
        active_host: 'http://fallback-2.test',
        username: 'alice',
        password: 'secret',
        stream_id: '202',
        vod_type: 'movie',
        container_extension: 'mkv',
      },
    ]);
    mockHostHealthService.getProviderHealth
      .mockResolvedValueOnce([{ status: 'online', host_url: 'http://host-1.test', response_time_ms: 786 }])
      .mockResolvedValueOnce([{ status: 'online', host_url: 'http://host-2.test', response_time_ms: 512 }]);

    const result = await handleStream('token-1', 'movie', 'tt15574124');

    expect(result).toEqual({
      streams: [
        {
          url: 'http://host-1.test/movie/alice/secret/101.mp4',
          title: 'Peaky Blinders: The Immortal Man (2026) (Hindi) — StreamBridge (Host 1, 786ms)',
          name: 'Peaky Blinders: The Immortal Man (2026) (Hindi)',
          behaviorHints: { notWebReady: false },
        },
        {
          url: 'http://host-2.test/movie/alice/secret/202.mkv',
          title: 'Peaky Blinders: The Immortal Man (2026) (Tamil) — StreamBridge (Host 1, 512ms)',
          name: 'Peaky Blinders: The Immortal Man (2026) (Tamil)',
          behaviorHints: { notWebReady: false },
        },
      ],
    });
  });

  it('filters movie variants by the user language preferences', async () => {
    mockCache.get.mockReturnValue(null);
    mockUserQueries.findByToken.mockResolvedValue({
      id: 'user-1',
      preferred_languages: ['hindi'],
      excluded_languages: [],
    });
    mockVodQueries.resolveByExternalIdForUser.mockResolvedValueOnce([
      {
        provider_id: 'provider-1',
        raw_title: 'War Machine (2026)',
        active_host: 'http://fallback-1.test',
        username: 'alice',
        password: 'secret',
        stream_id: '101',
        vod_type: 'movie',
        container_extension: 'mp4',
      },
      {
        provider_id: 'provider-1',
        raw_title: 'War Machine (2026) (Hindi)',
        active_host: 'http://fallback-1.test',
        username: 'alice',
        password: 'secret',
        stream_id: '102',
        vod_type: 'movie',
        container_extension: 'mp4',
      },
      {
        provider_id: 'provider-1',
        raw_title: 'War Machine (2026) (Tamil)',
        active_host: 'http://fallback-1.test',
        username: 'alice',
        password: 'secret',
        stream_id: '103',
        vod_type: 'movie',
        container_extension: 'mp4',
      },
    ]);
    mockHostHealthService.getProviderHealth
      .mockResolvedValueOnce([{ status: 'online', host_url: 'http://host-1.test', response_time_ms: 500 }]);

    const result = await handleStream('token-1', 'movie', 'tt15940132');

    expect(result).toEqual({
      streams: [
        {
          url: 'http://host-1.test/movie/alice/secret/102.mp4',
          title: 'War Machine (2026) (Hindi) — StreamBridge (Host 1, 500ms)',
          name: 'War Machine (2026) (Hindi)',
          behaviorHints: { notWebReady: false },
        },
      ],
    });
  });

  it('returns fallback movie URLs immediately when provider health rows are missing', async () => {
    mockCache.get.mockReturnValue(null);
    mockUserQueries.findByToken.mockResolvedValue({ id: 'user-1' });
    mockVodQueries.resolveByExternalIdForUser.mockResolvedValueOnce([
      {
        provider_id: 'provider-1',
        raw_title: 'War Machine (2026) (Hindi)',
        active_host: 'http://fallback-1.test',
        username: 'alice',
        password: 'secret',
        stream_id: '101',
        vod_type: 'movie',
        container_extension: 'mp4',
      },
    ]);
    mockProviderQueries.findByIdAndUser.mockResolvedValue({
      id: 'provider-1',
      active_host: 'http://fallback-1.test',
      hosts: ['http://fallback-1.test'],
      username: 'alice',
      password: 'secret',
    });
    mockHostHealthService.getProviderHealth.mockResolvedValue([]);

    const result = await handleStream('token-1', 'movie', 'tt15940132');

    expect(mockHostHealthService.checkSingleProvider).not.toHaveBeenCalled();
    expect(result).toEqual({
      streams: [
        {
          url: 'http://fallback-1.test/movie/alice/secret/101.mp4',
          title: 'War Machine (2026) (Hindi) — StreamBridge',
          name: 'War Machine (2026) (Hindi)',
          behaviorHints: { notWebReady: false },
        },
      ],
    });
  });

  it('returns all free-access fallback variants across languages', async () => {
    mockCache.get.mockReturnValue(null);
    mockUserQueries.findByToken.mockResolvedValue({ id: 'user-1' });
    mockVodQueries.resolveByExternalIdForUser.mockResolvedValueOnce([]);
    pool.query.mockResolvedValueOnce({ rows: [] });
    fetch.mockResolvedValueOnce({ ok: false });
    freeAccessService.resolveFallbackVodItemsForStream.mockResolvedValueOnce([
      {
        raw_title: 'War Machine (2026) (Hindi)',
        username: 'alice',
        password: 'secret',
        stream_id: '101',
        vod_type: 'movie',
        container_extension: 'mp4',
        access_source: 'free_access',
        playback_hosts: [{ host: 'http://free-host.test', responseTimeMs: 320 }],
        assignment_id: 'assignment-1',
      },
      {
        raw_title: 'War Machine (2026) (Tamil)',
        username: 'alice',
        password: 'secret',
        stream_id: '102',
        vod_type: 'movie',
        container_extension: 'mkv',
        access_source: 'free_access',
        playback_hosts: [{ host: 'http://free-host.test', responseTimeMs: 320 }],
        assignment_id: 'assignment-1',
      },
    ]);

    const result = await handleStream('token-1', 'movie', 'tt15940132');

    expect(result).toEqual({
      streams: [
        {
          url: 'http://free-host.test/movie/alice/secret/101.mp4',
          title: 'War Machine (2026) (Hindi) — StreamBridge (Host 1, 320ms)',
          name: 'War Machine (2026) (Hindi)',
          behaviorHints: { notWebReady: false },
        },
        {
          url: 'http://free-host.test/movie/alice/secret/102.mkv',
          title: 'War Machine (2026) (Tamil) — StreamBridge (Host 1, 320ms)',
          name: 'War Machine (2026) (Tamil)',
          behaviorHints: { notWebReady: false },
        },
      ],
    });
    expect(freeAccessService.recordResolvedStream).toHaveBeenCalledWith('assignment-1');
  });
});

describe('addonHandler tryOnDemandMatch', () => {
  it('backfills all successful movie variants for the same IMDb id', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1265609, original_title: 'War Machine', normalized_title: 'war machine', year: 2026, imdb_id: 'tt15940132', tmdb_type: 'movie' }] });
    mockVodQueries.findOnDemandCandidateForUser.mockResolvedValue([
      { raw_title: 'War Machine (2026)', normalized_title: 'war machine 2026' },
      { raw_title: 'War Machine (2026) (Hindi)', normalized_title: 'war machine 2026' },
      { raw_title: 'War Machine (2026) (Tamil)', normalized_title: 'war machine 2026' },
    ]);
    mockVodQueries.resolveByExternalIdForUser.mockResolvedValueOnce({ raw_title: 'War Machine (2026)', provider_id: 'provider-1' });
    mockTmdbQueries.exactMatchMovie.mockResolvedValue(null);
    mockTmdbQueries.fuzzyMatchMovie.mockResolvedValue({ id: 1265609, score: 0.7058824 });

    const result = await __test__.tryOnDemandMatch('user-1', 'tt15940132', 'movie');

    expect(mockMatchQueries.upsert).toHaveBeenCalledTimes(3);
    expect(mockTmdbQueries.exactMatchMovie).toHaveBeenCalledTimes(1);
    expect(mockTmdbQueries.fuzzyMatchMovie).toHaveBeenCalledTimes(1);
    expect(mockMatchQueries.upsert).toHaveBeenNthCalledWith(1, {
      rawTitle: 'War Machine (2026)',
      tmdbId: 1265609,
      tmdbType: 'movie',
      imdbId: 'tt15940132',
      confidenceScore: 0.7058824,
    });
    expect(mockMatchQueries.upsert).toHaveBeenNthCalledWith(2, {
      rawTitle: 'War Machine (2026) (Hindi)',
      tmdbId: 1265609,
      tmdbType: 'movie',
      imdbId: 'tt15940132',
      confidenceScore: 0.7058824,
    });
    expect(mockMatchQueries.upsert).toHaveBeenNthCalledWith(3, {
      rawTitle: 'War Machine (2026) (Tamil)',
      tmdbId: 1265609,
      tmdbType: 'movie',
      imdbId: 'tt15940132',
      confidenceScore: 0.7058824,
    });
    expect(result).toEqual({ raw_title: 'War Machine (2026)', provider_id: 'provider-1' });
  });

  it('skips TMDB rematching when a candidate already points at the same target', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1265609, original_title: 'War Machine', normalized_title: 'war machine', year: 2026, imdb_id: 'tt15940132', tmdb_type: 'movie' }] });
    mockVodQueries.findOnDemandCandidateForUser.mockResolvedValue([
      {
        raw_title: 'War Machine (2026)',
        normalized_title: 'war machine 2026',
        imdb_id: 'tt15940132',
        tmdb_id: 1265609,
        confidence_score: 0.91,
      },
    ]);
    mockVodQueries.resolveByExternalIdForUser.mockResolvedValueOnce({ raw_title: 'War Machine (2026)', provider_id: 'provider-1' });

    const result = await __test__.tryOnDemandMatch('user-1', 'tt15940132', 'movie');

    expect(mockTmdbQueries.exactMatchMovie).not.toHaveBeenCalled();
    expect(mockTmdbQueries.fuzzyMatchMovie).not.toHaveBeenCalled();
    expect(mockMatchQueries.upsert).toHaveBeenCalledWith({
      rawTitle: 'War Machine (2026)',
      tmdbId: 1265609,
      tmdbType: 'movie',
      imdbId: 'tt15940132',
      confidenceScore: 0.91,
    });
    expect(result).toEqual({ raw_title: 'War Machine (2026)', provider_id: 'provider-1' });
  });

  it('falls back to the matched candidate when the immediate post-match lookup is still empty', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1265609, original_title: 'War Machine', normalized_title: 'war machine', year: 2026, imdb_id: 'tt15940132', tmdb_type: 'movie' }] });
    mockVodQueries.findOnDemandCandidateForUser.mockResolvedValue([
      {
        raw_title: 'War Machine (2026)',
        normalized_title: 'war machine 2026',
        provider_id: 'provider-1',
        username: 'alice',
        password: 'secret',
        stream_id: '101',
        vod_type: 'movie',
        container_extension: 'mp4',
      },
    ]);
    mockVodQueries.resolveByExternalIdForUser.mockResolvedValueOnce(null);
    mockTmdbQueries.exactMatchMovie.mockResolvedValue(null);
    mockTmdbQueries.fuzzyMatchMovie.mockResolvedValue({ id: 1265609, score: 0.7058824 });

    const result = await __test__.tryOnDemandMatch('user-1', 'tt15940132', 'movie');

    expect(mockMatchQueries.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      raw_title: 'War Machine (2026)',
      provider_id: 'provider-1',
      username: 'alice',
      password: 'secret',
      stream_id: '101',
      vod_type: 'movie',
      container_extension: 'mp4',
    }));
  });

  it('matches short movie titles by stripping the target year from provider metadata', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 438631, original_title: 'Dune', normalized_title: 'dune', year: 2021, imdb_id: 'tt1160419', tmdb_type: 'movie' }] });
    mockVodQueries.findOnDemandCandidateForUser.mockResolvedValue([
      {
        raw_title: 'Dune (2021)',
        normalized_title: 'dune 2021',
      },
    ]);
    mockTmdbQueries.exactMatchMovie
      .mockResolvedValueOnce({ id: 438631, score: 1 });
    mockVodQueries.resolveByExternalIdForUser.mockResolvedValueOnce({ raw_title: 'Dune (2021)', provider_id: 'provider-1' });

    const result = await __test__.tryOnDemandMatch('user-1', 'tt1160419', 'movie');

    expect(mockTmdbQueries.exactMatchMovie).toHaveBeenNthCalledWith(1, 'dune', 2021);
    expect(mockTmdbQueries.fuzzyMatchMovie).not.toHaveBeenCalled();
    expect(mockMatchQueries.upsert).toHaveBeenCalledWith({
      rawTitle: 'Dune (2021)',
      tmdbId: 438631,
      tmdbType: 'movie',
      imdbId: 'tt1160419',
      confidenceScore: 1,
    });
    expect(result).toEqual({ raw_title: 'Dune (2021)', provider_id: 'provider-1' });
  });

  it('shares the same in-flight on-demand match across concurrent callers', async () => {
    const deferred = {};
    deferred.promise = new Promise((resolve) => {
      deferred.resolve = resolve;
    });

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1265609, original_title: 'War Machine', normalized_title: 'war machine', year: 2026, imdb_id: 'tt15940132', tmdb_type: 'movie' }] });

    mockVodQueries.findOnDemandCandidateForUser.mockReturnValue(deferred.promise);
    mockTmdbQueries.exactMatchMovie.mockResolvedValue(null);
    mockTmdbQueries.fuzzyMatchMovie.mockResolvedValue({ id: 1265609, score: 0.7058824 });
    mockVodQueries.resolveByExternalIdForUser.mockResolvedValueOnce({ raw_title: 'War Machine (2026)', provider_id: 'provider-1' });

    const firstPromise = __test__.resolveOnDemandMatchShared('user-1', 'tt15940132', 'movie');
    const secondPromise = __test__.resolveOnDemandMatchShared('user-1', 'tt15940132', 'movie');

    deferred.resolve([
      { raw_title: 'War Machine (2026)', normalized_title: 'war machine 2026' },
    ]);

    const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);

    expect(mockVodQueries.findOnDemandCandidateForUser).toHaveBeenCalledTimes(1);
    expect(mockTmdbQueries.exactMatchMovie).toHaveBeenCalledTimes(1);
    expect(mockTmdbQueries.fuzzyMatchMovie).toHaveBeenCalledTimes(1);
    expect(mockMatchQueries.upsert).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual({ raw_title: 'War Machine (2026)', provider_id: 'provider-1' });
    expect(secondResult).toEqual({ raw_title: 'War Machine (2026)', provider_id: 'provider-1' });
  });
});
