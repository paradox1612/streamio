const { normalizeTitle, extractContentLanguages } = require('../../src/utils/titleNormalization');

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
});
