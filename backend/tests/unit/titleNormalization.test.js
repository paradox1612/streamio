const {
  normalizeTitle,
  extractContentLanguages,
  parseMovieTitle,
  parseReleaseTitle,
  parseSeriesTitle,
} = require('../../src/utils/titleNormalization');

describe('titleNormalization', () => {
  it('strips regional language suffixes that should not block matching', () => {
    expect(normalizeTitle('War Machine (2026) (Tamil)')).toBe('war machine 2026');
    expect(normalizeTitle('War Machine (2026) (Telugu)')).toBe('war machine 2026');
    expect(normalizeTitle('War Machine (2026) (Hindi)')).toBe('war machine 2026');
  });

  it('extracts tagged content languages from provider titles', () => {
    expect(extractContentLanguages('War Machine (2026) (Tamil)')).toEqual(['tamil']);
    expect(extractContentLanguages('The Machine (2023) [Tamil, Eng]')).toEqual(['english', 'tamil']);
    expect(extractContentLanguages('War Machine (2026)')).toEqual([]);
  });

  it('parses canonical title, year, languages, and quality from trailing metadata groups', () => {
    expect(parseMovieTitle('Dune (2021) (Hindi) (4K)')).toEqual({
      canonicalTitle: 'Dune',
      canonicalNormalizedTitle: 'dune',
      year: 2021,
      languages: ['hindi'],
      qualityTags: ['4k'],
      metadataSegments: ['2021', 'Hindi', '4K'],
      movieTitle: 'Dune',
    });
  });

  it('parses dot-separated movie metadata tokens', () => {
    expect(parseMovieTitle('Dune.2021.Hindi.4K')).toEqual({
      canonicalTitle: 'Dune',
      canonicalNormalizedTitle: 'dune',
      year: 2021,
      languages: ['hindi'],
      qualityTags: ['4k'],
      metadataSegments: ['2021', 'Hindi', '4K'],
      movieTitle: 'Dune',
    });
  });

  it('parses mixed bracket and underscore movie metadata tokens', () => {
    expect(parseMovieTitle('Dune_[2021]_[Hindi]_WEB-DL')).toEqual({
      canonicalTitle: 'Dune',
      canonicalNormalizedTitle: 'dune',
      year: 2021,
      languages: ['hindi'],
      qualityTags: ['web-dl'],
      metadataSegments: ['2021', 'Hindi', 'WEB', 'DL'],
      movieTitle: 'Dune',
    });
  });

  it('parses series titles separately from season and episode markers', () => {
    expect(parseSeriesTitle('Silo S01E02 (Hindi)')).toEqual({
      canonicalTitle: 'Silo',
      canonicalNormalizedTitle: 'silo',
      year: null,
      languages: ['hindi'],
      qualityTags: [],
      metadataSegments: ['Hindi'],
      seriesTitle: 'Silo',
      seasonNumber: 1,
      episodeNumbers: [2],
    });
  });

  it('parses dot-separated series metadata tokens', () => {
    expect(parseSeriesTitle('Silo.S01E02.Hindi.1080p')).toEqual({
      canonicalTitle: 'Silo',
      canonicalNormalizedTitle: 'silo',
      year: null,
      languages: ['hindi'],
      qualityTags: ['1080p'],
      metadataSegments: ['Hindi', '1080p'],
      seriesTitle: 'Silo',
      seasonNumber: 1,
      episodeNumbers: [2],
    });
  });

  it('keeps the generic parser available for live and fallback cases', () => {
    expect(parseReleaseTitle('Sky Sports Main Event')).toEqual({
      canonicalTitle: 'Sky Sports Main Event',
      canonicalNormalizedTitle: 'sky sports main event',
      year: null,
      languages: [],
      qualityTags: [],
      metadataSegments: [],
    });
  });
});
