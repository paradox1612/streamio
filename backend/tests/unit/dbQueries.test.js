jest.mock('../../src/db/pool', () => ({
  query: jest.fn(),
}));

const pool = require('../../src/db/pool');
const { tmdbQueries } = require('../../src/db/queries');

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
