jest.mock('node-fetch', () => jest.fn());

const mockTmdbQueries = {
  upsertMovie: jest.fn(),
};

jest.mock('../../src/db/queries', () => ({
  userQueries: {},
  providerQueries: {},
  vodQueries: {},
  tmdbQueries: mockTmdbQueries,
  matchQueries: {},
  hostHealthQueries: {},
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../src/services/providerService', () => ({}));
jest.mock('../../src/services/epgService', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn(), set: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/utils/loadManager', () => ({
  beginAddonRequest: jest.fn(),
  endAddonRequest: jest.fn(),
}));

process.env.TMDB_API_KEY = 'test-key';

const fetch = require('node-fetch');
const { pool } = require('../../src/db/queries');
const { __test__ } = require('../../src/addon/addonHandler');

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
