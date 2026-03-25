const cron = require('node-cron');
const { providerQueries } = require('../db/queries');
const hostHealthService = require('../services/hostHealthService');
const tmdbService = require('../services/tmdbService');
const providerService = require('../services/providerService');
const { jobQueries } = require('../db/queries');
const logger = require('../utils/logger');

// ─── Job Implementations ──────────────────────────────────────────────────────

async function healthCheckJob() {
  logger.info('[Job] Health check starting...');
  const jobId = await jobQueries.start('healthCheckJob');
  try {
    await hostHealthService.checkAll();
    await jobQueries.finish(jobId, { status: 'success' });
    logger.info('[Job] Health check complete');
  } catch (err) {
    await jobQueries.finish(jobId, { status: 'failed', errorMessage: err.message });
    logger.error('[Job] Health check failed:', err.message);
  }
}

async function tmdbSyncJob() {
  logger.info('[Job] TMDB sync starting...');
  try {
    const result = await tmdbService.syncExports();
    logger.info(`[Job] TMDB sync complete: ${result.movieCount} movies, ${result.seriesCount} series`);
  } catch (err) {
    logger.error('[Job] TMDB sync failed:', err.message);
  }
}

async function catalogRefreshJob() {
  logger.info('[Job] Catalog refresh starting...');
  const jobId = await jobQueries.start('catalogRefreshJob');
  try {
    const providers = await providerQueries.getAllForHealthCheck();
    logger.info(`[Job] Refreshing ${providers.length} providers...`);

    let total = 0;
    for (const provider of providers) {
      try {
        const result = await providerService.refreshCatalog(provider.id, provider.user_id);
        total += result.total;
      } catch (err) {
        logger.warn(`[Job] Failed to refresh provider ${provider.id}: ${err.message}`);
      }
    }

    await jobQueries.finish(jobId, { status: 'success', metadata: { providersRefreshed: providers.length, totalItems: total } });
    logger.info(`[Job] Catalog refresh complete: ${total} items across ${providers.length} providers`);
  } catch (err) {
    await jobQueries.finish(jobId, { status: 'failed', errorMessage: err.message });
    logger.error('[Job] Catalog refresh failed:', err.message);
  }
}

async function matchingJob() {
  logger.info('[Job] Matching job starting...');
  try {
    const result = await tmdbService.runMatching(10000);
    logger.info(`[Job] Matching complete: ${result.matched} matched, ${result.failed} unmatched`);
  } catch (err) {
    logger.error('[Job] Matching job failed:', err.message);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

function startScheduler() {
  logger.info('Starting background job scheduler...');

  // Every 5 minutes
  cron.schedule('*/5 * * * *', healthCheckJob);

  // Every day at 2 AM
  cron.schedule('0 2 * * *', tmdbSyncJob);

  // Every day at 4 AM (after TMDB sync)
  cron.schedule('0 4 * * *', catalogRefreshJob);

  // Every day at 5 AM (after catalog refresh)
  cron.schedule('0 5 * * *', matchingJob);

  logger.info('Scheduler started: health=*/5min, tmdb=2am, catalog=4am, matching=5am');

  // Run health check immediately on startup
  setTimeout(healthCheckJob, 5000);
}

const jobs = {
  healthCheckJob,
  tmdbSyncJob,
  catalogRefreshJob,
  matchingJob,
};

module.exports = { startScheduler, jobs };
