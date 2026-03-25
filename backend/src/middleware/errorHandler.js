const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(`${req.method} ${req.path} → ${err.message}`, err.stack);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
