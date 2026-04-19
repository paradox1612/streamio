jest.mock('../../src/utils/xtreamUiScraper', () => ({
  isSessionValid: jest.fn(),
  autoLogin: jest.fn(),
  getPackages: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const xtreamUiScraper = require('../../src/utils/xtreamUiScraper');
const XtreamUiScraperAdapter = require('../../src/providers/adapters/XtreamUiScraperAdapter');

describe('XtreamUiScraperAdapter offering plan validation', () => {
  const network = {
    id: 'network-1',
    name: 'Starshare',
    reseller_portal_url: 'https://panel.example.com',
    reseller_session_cookie: 'cookie-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    xtreamUiScraper.isSessionValid.mockResolvedValue(true);
  });

  it('parses billing metadata from package names', async () => {
    xtreamUiScraper.getPackages.mockResolvedValue([
      { id: '3', name: '1 MONTH ( OFFICIAL LINE ) ( 1 CREDIT )' },
      { id: '5', name: '3 MONTH ( OFFICIAL LINE ) ( 3 CREDIT )' },
    ]);

    const adapter = new XtreamUiScraperAdapter(network);
    const packages = await adapter.getPackages();

    expect(packages).toEqual([
      expect.objectContaining({ id: '3', billing_period: 'month', billing_interval_count: 1 }),
      expect.objectContaining({ id: '5', billing_period: 'month', billing_interval_count: 3 }),
    ]);
  });

  it('requires reseller packages for non-trial plans', async () => {
    xtreamUiScraper.getPackages.mockResolvedValue([]);

    const adapter = new XtreamUiScraperAdapter(network);

    await expect(adapter.validateOfferingPlans([
      { code: 'plan_1', name: '1 Month', billing_period: 'month', billing_interval_count: 1, trial_days: 0 },
    ])).rejects.toThrow('Plan "1 Month" requires a reseller package for scraper-based providers.');
  });

  it('rejects mismatched billing metadata against selected package', async () => {
    xtreamUiScraper.getPackages.mockResolvedValue([
      { id: '5', name: '3 MONTH ( OFFICIAL LINE ) ( 3 CREDIT )' },
    ]);

    const adapter = new XtreamUiScraperAdapter(network);

    await expect(adapter.validateOfferingPlans([
      { code: 'plan_1', name: 'Wrong Plan', billing_period: 'month', billing_interval_count: 1, reseller_package_id: '5', trial_days: 0 },
    ])).rejects.toThrow('Plan "Wrong Plan" billing interval count "1" does not match reseller package "3 MONTH ( OFFICIAL LINE ) ( 3 CREDIT )". Expected "3".');
  });
});
