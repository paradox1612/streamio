jest.mock('node-fetch', () => jest.fn());

const mockTmdbQueries = {
  upsertMovie: jest.fn(),
};
const mockUserQueries = {
  findByToken: jest.fn(),
};
const mockHostHealthQueries = {
  getByProvider: jest.fn(),
};
const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
};

jest.mock('../../src/db/queries', () => ({
  userQueries: mockUserQueries,
  providerQueries: {},
  vodQueries: {},
  tmdbQueries: mockTmdbQueries,
  matchQueries: {},
  hostHealthQueries: mockHostHealthQueries,
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../src/services/providerService', () => ({}));
jest.mock('../../src/services/epgService', () => ({}));
jest.mock('../../src/utils/cache', () => mockCache);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/utils/loadManager', () => ({
  beginAddonRequest: jest.fn(),
  endAddonRequest: jest.fn(),
}));

process.env.TMDB_API_KEY = 'test-key';

const fetch = require('node-fetch');
const { pool } = require('../../src/db/queries');
const { handleStream, __test__ } = require('../../src/addon/addonHandler');

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

describe('addonHandler handleStream', () => {
  it('returns all matching movie variants with raw titles in the stream labels', async () => {
    mockCache.get.mockReturnValue(null);
    mockUserQueries.findByToken.mockResolvedValue({ id: 'user-1' });
    pool.query.mockResolvedValueOnce({
      rows: [
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
      ],
    });
    mockHostHealthQueries.getByProvider
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
});
