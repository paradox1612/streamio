function getAppRole() {
  return (process.env.APP_ROLE || 'all').trim().toLowerCase();
}

function shouldRunHttpServer() {
  const role = getAppRole();
  return role === 'all' || role === 'web' || role === 'api';
}

function shouldRunScheduler() {
  const role = getAppRole();
  return role === 'all' || role === 'scheduler' || role === 'worker';
}

module.exports = {
  getAppRole,
  shouldRunHttpServer,
  shouldRunScheduler,
};
