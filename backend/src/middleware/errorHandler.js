const logger = require('../utils/logger');
const { errorReportQueries } = require('../db/queries');

function clip(value, max = 4000) {
  if (value == null) return null;
  return String(value).slice(0, max);
}

async function errorHandler(err, req, res, next) {
  logger.error(`${req.method} ${req.path} → ${err.message}`, err.stack);
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    try {
      await errorReportQueries.create({
        source: 'backend',
        severity: 'error',
        message: clip(err.message || 'Internal server error', 2000),
        errorType: clip(err.name, 255),
        stack: clip(err.stack, 16000),
        requestMethod: clip(req.method, 16),
        requestPath: clip(req.originalUrl || req.path, 2000),
        routePath: clip(req.path, 1000),
        userAgent: clip(req.headers['user-agent'], 2000),
        reporterEmail: clip(req.user?.email, 255),
        userId: req.user?.id || null,
        adminContext: req.path.startsWith('/admin'),
        context: {
          params: req.params || {},
          query: req.query || {},
          bodyKeys: Object.keys(req.body || {}),
        },
      });
    } catch (reportErr) {
      logger.error(`Failed to persist error report: ${reportErr.message}`, reportErr.stack);
    }
  }

  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
