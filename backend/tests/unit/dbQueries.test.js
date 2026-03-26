jest.mock('../../src/db/pool', () => ({
  query: jest.fn(),
}));

const pool = require('../../src/db/pool');
const { tmdbQueries, vodQueries } = require('../../src/db/queries');

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue({ rows: [] });
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
      expect.stringContaining('OR m.tmdb_id IS NULL'),
      ['user-1', 'movie', 'tt15940132', 1265609, 'war machine']
    );
  });
});

describe('vodQueries provider catalog ordering', () => {
  it('orders provider titles by normalized title so similar names stay grouped', async () => {
    await vodQueries.getByProvider('provider-1', { type: 'movie', page: 1, limit: 50 });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY\n      v.normalized_title ASC NULLS LAST,\n      v.raw_title ASC,\n      v.stream_id ASC'),
      ['provider-1', 'movie', 50, 0]
    );
  });
});
