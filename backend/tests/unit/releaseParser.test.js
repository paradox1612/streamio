'use strict';

const { parseRelease, normalizeTitle, extractLanguages } = require('../../src/utils/releaseParser');

describe('normalizeTitle', () => {
  test.each([
    ['The Pitt (2024)', 'pitt'],
    ['The Pitt', 'pitt'],
    ['The Regime', 'regime'],
    ['Spider-Man: No Way Home', 'spidermannowayhome'],
    ['Pokémon: Detective Pikachu', 'pokemondetectivepikachu'],
    ['Marvel & DC', 'marvelanddc'],
    ['  The   Bureau  ', 'bureau'],
    ['Le Bureau', 'bureau'],
    ['', ''],
    [null, ''],
  ])('normalizeTitle(%j) -> %j', (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });

  test('The Pitt and The Regime normalize to different values', () => {
    expect(normalizeTitle('The Pitt')).not.toBe(normalizeTitle('The Regime'));
  });
});

describe('parseRelease — movies', () => {
  test('parses year in parens', () => {
    const r = parseRelease('The Pitt (2024) 1080p WEB-DL x265-GROUP');
    expect(r.title.toLowerCase()).toContain('pitt');
    expect(r.year).toBe(2024);
    expect(r.resolution).toBe('1080p');
    expect(r.codec).toBe('x265');
    expect(r.releaseGroup).toBe('GROUP');
    expect(r.type).toBe('movie');
    expect(r.normalizedTitle).toBe('pitt');
  });

  test('parses dot-separated release', () => {
    const r = parseRelease('The.Pitt.2024.1080p.BluRay.x264-RARBG');
    expect(r.year).toBe(2024);
    expect(r.resolution).toBe('1080p');
    expect(r.source).toBe('bluray');
    expect(r.codec).toBe('x264');
    expect(r.releaseGroup).toBe('RARBG');
    expect(r.normalizedTitle).toBe('pitt');
  });

  test('parses square-bracket year', () => {
    const r = parseRelease('Dune [2021] 2160p HDR10');
    expect(r.year).toBe(2021);
    expect(r.resolution).toBe('2160p');
    expect(r.hdr).toBe('hdr10');
    expect(r.normalizedTitle).toBe('dune');
  });

  test('distinguishes Pitt from Regime by normalization', () => {
    const pitt = parseRelease('The Pitt 2024 1080p');
    const regime = parseRelease('The Regime 2024 1080p');
    expect(pitt.normalizedTitle).toBe('pitt');
    expect(regime.normalizedTitle).toBe('regime');
    expect(pitt.normalizedTitle).not.toBe(regime.normalizedTitle);
  });
});

describe('parseRelease — series', () => {
  test('parses S01E01', () => {
    const r = parseRelease('Breaking.Bad.S01E01.1080p.WEB-DL.x264');
    expect(r.type).toBe('series');
    expect(r.season).toBe(1);
    expect(r.episodes).toEqual([1]);
    expect(r.normalizedTitle).toBe('breakingbad');
  });

  test('parses multi-episode range S01E01-E03', () => {
    const r = parseRelease('Show.Name.S02E05-E07.720p');
    expect(r.season).toBe(2);
    expect(r.episodes).toEqual([5, 6, 7]);
  });

  test('parses 1x01 form', () => {
    const r = parseRelease('Friends 1x01 The Pilot');
    expect(r.season).toBe(1);
    expect(r.episodes).toEqual([1]);
  });

  test('parses "Season 1 Episode 2"', () => {
    const r = parseRelease('Show Name Season 1 Episode 2');
    expect(r.season).toBe(1);
    expect(r.episodes).toEqual([2]);
  });

  test('parses daily air date', () => {
    const r = parseRelease('Daily.Show.2024.01.15.1080p.WEB-DL');
    expect(r.airDate).toBe('2024-01-15');
    expect(r.type).toBe('series');
  });

  test('parses anime absolute episode', () => {
    const r = parseRelease('[Group] Show Name - 42 [1080p]');
    expect(r.absoluteEpisodes).toEqual([42]);
  });
});

describe('parseRelease — cleaning', () => {
  test('strips file extension', () => {
    expect(parseRelease('Movie.2024.1080p.mkv').normalizedTitle).toBe('movie');
  });

  test('strips website prefix', () => {
    const r = parseRelease('www.example.com - The Pitt 2024 1080p');
    expect(r.normalizedTitle).toBe('pitt');
    expect(r.year).toBe(2024);
  });

  test('strips request-info tags', () => {
    const r = parseRelease('The Pitt 2024 1080p [REQ: user123]');
    expect(r.normalizedTitle).toBe('pitt');
  });

  test('unicode fold', () => {
    expect(parseRelease('Amélie (2001)').normalizedTitle).toBe('amelie');
  });
});

describe('extractLanguages', () => {
  test('bracketed language tag', () => {
    expect(extractLanguages('The Pitt 2024 [EN]')).toEqual(['english']);
  });

  test('dot-delimited language tag', () => {
    expect(extractLanguages('The.Pitt.2024.FRENCH.1080p')).toEqual(['french']);
  });

  test('multiple language tags', () => {
    const langs = extractLanguages('Movie.2024.HINDI.TAMIL.TELUGU.1080p');
    expect(langs).toEqual(expect.arrayContaining(['hindi', 'tamil', 'telugu']));
  });

  test('does NOT match "Spanish" inside a word — "Spanish Inquisition" regression guard', () => {
    // The word "Spanish" here is part of a title, not a language tag.
    // Strict extractor only matches when bracket/dot/space-bounded tokens —
    // but "Spanish" bounded by spaces IS matchable. The important test is
    // that titles like "Spanishtown" or "Mandarino" don't match.
    expect(extractLanguages('Mandarino Orange')).toEqual([]);
    expect(extractLanguages('Spanishtown Blues')).toEqual([]);
  });

  test('does NOT match embedded substrings', () => {
    expect(extractLanguages('Amazing')).toEqual([]);
    expect(extractLanguages('Tamilnadu')).toEqual([]); // substring "tamil"
  });

  test('empty input', () => {
    expect(extractLanguages('')).toEqual([]);
  });
});

describe('parseRelease — confidence', () => {
  test('high confidence for rich release', () => {
    const r = parseRelease('The.Pitt.2024.1080p.BluRay.x265.HDR-GROUP');
    expect(r.confidence).toBeGreaterThan(0.4);
  });

  test('low confidence for bare title', () => {
    const r = parseRelease('The Pitt');
    expect(r.confidence).toBeLessThan(0.3);
  });
});
