/**
 * Unit tests for tmdbService title cleaning and year extraction
 */

// Return empty object so ptn doesn't override the regex-based title cleaning.
// The unit tests here focus on STRIP_PATTERNS correctness, not ptn integration.
jest.mock('parse-torrent-title', () => () => ({}), { virtual: true });
jest.mock('node-fetch', () => jest.fn());

const mockTmdbQueries = {
  exactMatchMovie: jest.fn(),
  exactMatchSeries: jest.fn(),
  fuzzyMatchMovie: jest.fn(),
  fuzzyMatchSeries: jest.fn(),
};
const mockMatchQueries = {
  upsert: jest.fn(),
};
const mockVodQueries = {
  getUnmatchedForMatching: jest.fn(),
};
const mockJobQueries = {
  start: jest.fn().mockResolvedValue('job-id'),
  finish: jest.fn(),
};

jest.mock('../../src/db/queries', () => ({
  tmdbQueries: mockTmdbQueries,
  matchQueries: mockMatchQueries,
  vodQueries: mockVodQueries,
  jobQueries: mockJobQueries,
}));

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

process.env.TMDB_API_KEY = 'test-key';

const fetch = require('node-fetch');
const { cleanTitle, extractYear, runMatching } = require('../../src/services/tmdbService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tmdbService – cleanTitle', () => {
  const cases = [
    ['The Matrix (1999) Hindi Dubbed 1080p', 'The Matrix'],
    ['Avengers Endgame 4K UHD BluRay', 'Avengers Endgame'],
    ['[AR] Breaking Bad S01E01 HD', 'Breaking Bad'],
    ['La Casa de Papel | Spanish | FHD', 'La Casa de Papel'],
    ['Inception (2010)', 'Inception'],
    ['Interstellar HEVC x265', 'Interstellar'],
    ['Game of Thrones Season 8', 'Game of Thrones'],
  ];

  test.each(cases)('cleanTitle(%s) → %s', (raw, expected) => {
    const result = cleanTitle(raw);
    expect(result.toLowerCase()).toContain(expected.toLowerCase().split(' ')[0]);
  });
});

describe('tmdbService – extractYear', () => {
  const cases = [
    ['The Matrix (1999)', 1999],
    ['Inception 2010 BluRay', 2010],
    ['Avengers Endgame', null],
    ['Movie 1920p HD', null], // resolution, not year
    ['Avatar 2009 1080p', 2009],
  ];

  test.each(cases)('extractYear(%s) → %s', (raw, expected) => {
    const result = extractYear(raw);
    expect(result).toBe(expected);
  });
});

describe('tmdbService – runMatching', () => {
  it('falls back to title-only matching when the provider year is wrong', async () => {
    mockVodQueries.getUnmatchedForMatching
      .mockResolvedValueOnce([
        { raw_title: 'Beverly Hills Cop: Axel F (2024) (English)', vod_type: 'movie', tmdb_id: null, imdb_id: null, confidence_score: null },
      ])
      .mockResolvedValueOnce([]);

    mockTmdbQueries.exactMatchMovie
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 280180, imdb_id: 'tt3083016', score: 1 });
    mockTmdbQueries.fuzzyMatchMovie.mockResolvedValue(null);

    const result = await runMatching(1);

    expect(mockTmdbQueries.exactMatchMovie).toHaveBeenNthCalledWith(1, 'beverly hills cop axel f', 2024);
    expect(mockTmdbQueries.fuzzyMatchMovie).toHaveBeenNthCalledWith(1, 'beverly hills cop axel f', 2024);
    expect(mockTmdbQueries.exactMatchMovie).toHaveBeenNthCalledWith(2, 'beverly hills cop axel f', null);
    expect(mockMatchQueries.upsert).toHaveBeenCalledWith({
      rawTitle: 'Beverly Hills Cop: Axel F (2024) (English)',
      tmdbId: 280180,
      tmdbType: 'movie',
      imdbId: 'tt3083016',
      confidenceScore: 1,
    });
    expect(result).toMatchObject({ matched: 1, enriched: 0, failed: 0, total: 1 });
  });

  it('fetches IMDb IDs for newly matched movies', async () => {
    mockVodQueries.getUnmatchedForMatching
      .mockResolvedValueOnce([
        { raw_title: 'The Matrix (1999)', vod_type: 'movie', tmdb_id: null, imdb_id: null, confidence_score: null },
      ])
      .mockResolvedValueOnce([]);
    mockTmdbQueries.exactMatchMovie.mockResolvedValue(null);
    mockTmdbQueries.fuzzyMatchMovie.mockResolvedValue({ id: 603, imdb_id: null, score: 0.94 });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ imdb_id: 'tt0133093' }),
    });

    const result = await runMatching(1);

    expect(mockVodQueries.getUnmatchedForMatching).toHaveBeenCalledWith(1, { enrichMissingImdb: true });
    expect(fetch).toHaveBeenCalledWith('https://api.themoviedb.org/3/movie/603/external_ids?api_key=test-key');
    expect(mockMatchQueries.upsert).toHaveBeenCalledWith({
      rawTitle: 'The Matrix (1999)',
      tmdbId: 603,
      tmdbType: 'movie',
      imdbId: 'tt0133093',
      confidenceScore: 0.94,
    });
    expect(result).toMatchObject({ matched: 1, enriched: 0, failed: 0, total: 1 });
  });

  it('backfills IMDb IDs for existing series matches', async () => {
    mockVodQueries.getUnmatchedForMatching
      .mockResolvedValueOnce([
        { raw_title: 'Breaking Bad', vod_type: 'series', tmdb_id: 1396, imdb_id: null, confidence_score: 0.91 },
      ])
      .mockResolvedValueOnce([]);
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ imdb_id: 'tt0903747' }),
    });

    const result = await runMatching(1);

    expect(mockVodQueries.getUnmatchedForMatching).toHaveBeenCalledWith(1, { enrichMissingImdb: true });
    expect(fetch).toHaveBeenCalledWith('https://api.themoviedb.org/3/tv/1396/external_ids?api_key=test-key');
    expect(mockMatchQueries.upsert).toHaveBeenCalledWith({
      rawTitle: 'Breaking Bad',
      tmdbId: 1396,
      tmdbType: 'series',
      imdbId: 'tt0903747',
      confidenceScore: 0.91,
    });
    expect(result).toMatchObject({ matched: 0, enriched: 1, failed: 0, total: 1 });
  });

  it('keeps processing batches until the queue is empty', async () => {
    mockVodQueries.getUnmatchedForMatching
      .mockResolvedValueOnce([
        { raw_title: 'The Matrix (1999)', vod_type: 'movie', tmdb_id: null, imdb_id: null, confidence_score: null },
      ])
      .mockResolvedValueOnce([
        { raw_title: 'Breaking Bad', vod_type: 'series', tmdb_id: 1396, imdb_id: null, confidence_score: 0.91 },
      ])
      .mockResolvedValueOnce([]);

    mockTmdbQueries.exactMatchMovie.mockResolvedValueOnce({ id: 603, imdb_id: 'tt0133093', score: 1 });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ imdb_id: 'tt0903747' }),
    });

    const result = await runMatching(1);

    expect(mockVodQueries.getUnmatchedForMatching).toHaveBeenCalledTimes(3);
    expect(mockMatchQueries.upsert).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ matched: 1, enriched: 1, failed: 0, total: 2, batches: 2 });
  });
});
