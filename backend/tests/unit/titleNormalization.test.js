const { normalizeTitle } = require('../../src/utils/titleNormalization');

describe('titleNormalization', () => {
  it('strips regional language suffixes that should not block matching', () => {
    expect(normalizeTitle('War Machine (2026) (Tamil)')).toBe('war machine 2026');
    expect(normalizeTitle('War Machine (2026) (Telugu)')).toBe('war machine 2026');
    expect(normalizeTitle('War Machine (2026) (Hindi)')).toBe('war machine 2026');
  });
});
