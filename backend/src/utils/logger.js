const { createLogger, format, transports } = require('winston');

const SPLAT = Symbol.for('splat');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.printf((info) => {
      const { timestamp, level, message, stack, ...meta } = info;
      const extras = Object.keys(meta).filter(k => !['service', 'splat'].includes(k));
      const splat = Array.isArray(info[SPLAT]) ? info[SPLAT].filter(value => value !== undefined && value !== '') : [];
      const metaParts = extras.map(k => `${k}=${JSON.stringify(meta[k])}`);
      const splatParts = splat.map((value) => {
        if (typeof value === 'string') return value;
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      });
      const suffix = [...metaParts, ...splatParts].join(' ');
      return `${timestamp} [${level.toUpperCase()}] ${message}${suffix ? ` ${suffix}` : ''}${stack ? '\n' + stack : ''}`;
    })
  ),
  transports: [new transports.Console()],
});

module.exports = logger;
