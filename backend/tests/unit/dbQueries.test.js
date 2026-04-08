jest.mock('../../src/db/pool', () => {
  const queryMock = jest.fn();
  const releaseMock = jest.fn();
  return {
    query: queryMock,
    connect: jest.fn().mockResolvedValue({
      query: queryMock,
      release: releaseMock,
    }),
  };
});

const pool = require('../../src/db/pool');
const { tmdbQueries, vodQueries, matchQueries } = require('../../src/db/queries');

// Mock pg-copy-streams and stream/promises
jest.mock('pg-copy-streams', () => ({
  from: jest.fn().mockReturnValue('mock-stream'),
}));
jest.mock('stream/promises', () => ({
  pipeline: jest.fn().mockResolvedValue(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue({ rows: [] });
  // If pool.connect() is called, its .query is the same queryMock
});

describe('tmdbQueries movie matching', () => {
  it('keeps NULL release_year rows eligible for exact movie matches', async () => {
    await tmdbQueries.exactMatchMovie('peaky blinders the immortal man 2026', 2026);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('(release_year IS NULL OR ABS(release_year - $2) <= 1)'),
      ['peaky blinders the immortal man 2026', 2026]
    );
  });

  it('keeps NULL release_year rows eligible for fuzzy movie matches', async () => {
    await tmdbQueries.fuzzyMatchMovie('peaky blinders the immortal man 2026', 2026);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE release_year IS NULL OR ABS(release_year - $2) <= 2'),
      ['peaky blinders the immortal man 2026', 2026]
    );
  });
});

describe('vodQueries on-demand candidate lookup', () => {
  it('keeps placeholder matched_content rows eligible when tmdb_id is still NULL', async () => {
    await vodQueries.findOnDemandCandidateForUser('user-1', {
      vodType: 'movie',
      normalizedTitle: 'war machine',
      year: 2026,
      tmdbId: 1265609,
      imdbId: 'tt15940132',
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      ['user-1', 'movie', 'war machine', 2026, 'tt15940132', 1265609]
    );
  });
});

describe('vodQueries provider catalog ordering', () => {
  it('orders provider titles by normalized title so similar names stay grouped', async () => {
    await vodQueries.getByProvider('provider-1', { type: 'movie', page: 1, limit: 50 });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY\n      v.canonical_normalized_title ASC NULLS LAST,\n      v.normalized_title ASC NULLS LAST,\n      v.raw_title ASC,\n      v.stream_id ASC'),
      ['provider-1', null, 'movie', 50, 0]
    );
  });
});

describe('matchQueries upsert', () => {
  it('avoids rewriting identical rows to reduce WAL churn', async () => {
    await matchQueries.upsert({
      rawTitle: 'The Matrix',
      tmdbId: 603,
      tmdbType: 'movie',
      imdbId: 'tt0133093',
      confidenceScore: 1,
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE matched_content.tmdb_id IS DISTINCT FROM EXCLUDED.tmdb_id'),
      ['The Matrix', 603, 'movie', 'tt0133093', 1]
    );
  });
});

describe('vodQueries batch upserts', () => {
  it('deduplicates duplicate provider rows inside the same upsert batch using streams', async () => {
    await vodQueries.upsertBatch([
      {
        userId: 'user-1',
        providerId: 'provider-1',
        streamId: '42',
        rawTitle: 'First Title',
        normalizedTitle: 'first title',
        posterUrl: null,
        category: 'Movies',
        vodType: 'movie',
      },
      {
        userId: 'user-1',
        providerId: 'provider-1',
        streamId: '42',
        rawTitle: 'Updated Title',
        normalizedTitle: 'updated title',
        posterUrl: null,
        category: 'Movies',
        vodType: 'movie',
      },
    ]);

    expect(pool.connect).toHaveBeenCalled();
    const calls = pool.query.mock.calls;
    expect(calls.some(call => call[0] && call[0].includes('temp_user_provider_vod'))).toBeTruthy();
    expect(calls.some(call => call[0] && call[0].includes('WHERE user_provider_vod.user_id IS DISTINCT FROM EXCLUDED.user_id'))).toBeTruthy();
    expect(calls.some(call => call[0] && call[0].includes('DELETE FROM user_provider_vod existing'))).toBeTruthy();
  });
});
