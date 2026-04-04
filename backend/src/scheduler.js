require('dotenv').config();

const { startScheduler } = require('./jobs/scheduler');
const logger = require('./utils/logger');
const { getAppRole, shouldRunScheduler } = require('./utils/runtimeRole');

const role = getAppRole();

if (!shouldRunScheduler()) {
  logger.error(`APP_ROLE=${role} does not allow the scheduler process to start`);
  process.exit(1);
}

logger.info(`Starting scheduler process with APP_ROLE=${role}`);
startScheduler();

function shutdown(signal) {
  logger.info(`Scheduler received ${signal}, exiting`);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
