const { userQueries } = require('../db/queries');
const cache = require('./cache');
const logger = require('./logger');

async function touchUserLastSeen(userId) {
  if (!userId) return false;

  const touchKey = String(userId);
  if (await cache.get('userActivityTouch', touchKey)) {
    return false;
  }

  await cache.set('userActivityTouch', touchKey, true);

  try {
    await userQueries.updateLastSeen(userId);
    return true;
  } catch (err) {
    await cache.del('userActivityTouch', touchKey);
    logger.warn(`Failed to update last_seen for user ${userId}: ${err.message}`);
    return false;
  }
}

module.exports = { touchUserLastSeen };
