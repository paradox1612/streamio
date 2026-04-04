const os = require('os');
const { getAppRole, shouldRunHttpServer, shouldRunScheduler } = require('./runtimeRole');

function getRuntimeInfo() {
  return {
    appRole: getAppRole(),
    hostname: os.hostname(),
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV || 'development',
    httpServerEnabled: shouldRunHttpServer(),
    schedulerEnabled: shouldRunScheduler(),
  };
}

function getJobRunnerMetadata(extra = {}) {
  const runtime = getRuntimeInfo();
  return {
    runnerRole: runtime.appRole,
    runnerHostname: runtime.hostname,
    runnerPid: runtime.pid,
    ...extra,
  };
}

module.exports = {
  getRuntimeInfo,
  getJobRunnerMetadata,
};
