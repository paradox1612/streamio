const { getAppRole, shouldRunHttpServer, shouldRunScheduler } = require('../../src/utils/runtimeRole');

describe('runtimeRole', () => {
  const originalRole = process.env.APP_ROLE;

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env.APP_ROLE;
    } else {
      process.env.APP_ROLE = originalRole;
    }
  });

  test('defaults to all when APP_ROLE is unset', () => {
    delete process.env.APP_ROLE;

    expect(getAppRole()).toBe('all');
    expect(shouldRunHttpServer()).toBe(true);
    expect(shouldRunScheduler()).toBe(true);
  });

  test('web role only runs the HTTP server', () => {
    process.env.APP_ROLE = 'web';

    expect(shouldRunHttpServer()).toBe(true);
    expect(shouldRunScheduler()).toBe(false);
  });

  test('scheduler role only runs background jobs', () => {
    process.env.APP_ROLE = 'scheduler';

    expect(shouldRunHttpServer()).toBe(false);
    expect(shouldRunScheduler()).toBe(true);
  });
});
