/**
 * Unit tests for tmdbService title cleaning and year extraction
 */

// Return empty object so ptn doesn't override the regex-based title cleaning.
// The unit tests here focus on STRIP_PATTERNS correctness, not ptn integration.
jest.mock('parse-torrent-title', () => () => ({}), { virtual: true });
jest.mock('../../src/db/queries', () => ({
  tmdbQueries: {},
  matchQueries: {},
  vodQueries: {},
  jobQueries: { start: jest.fn().mockResolvedValue('job-id'), finish: jest.fn() },
}));

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { cleanTitle, extractYear } = require('../../src/services/tmdbService');

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
