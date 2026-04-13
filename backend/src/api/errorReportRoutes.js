const router = require('express').Router();
const jwt = require('jsonwebtoken');
const authService = require('../services/authService');
const { errorReportQueries, userQueries } = require('../db/queries');

function clip(value, max = 4000) {
  if (value == null) return null;
  return String(value).slice(0, max);
}

function sanitizeContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

async function resolveReporter(req, explicitEmail) {
  let user = null;
  let adminContext = false;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = authService.verifyJwt(authHeader.slice(7));
      user = await userQueries.findById(payload.userId);
    } catch (_) {}
  }

  const adminToken = req.headers['x-admin-token'];
  if (adminToken) {
    try {
      const payload = jwt.verify(adminToken, process.env.JWT_SECRET);
      adminContext = Boolean(payload?.admin);
    } catch (_) {}
  }

  return {
    userId: user?.id || null,
    reporterEmail: clip(explicitEmail || user?.email, 255),
    adminContext,
  };
}

router.post('/', async (req, res) => {
  const message = clip(req.body?.message, 2000);
  if (!message) {
    return res.status(400).json({ error: 'Error message is required' });
  }

  const reportKind = clip(req.body?.reportKind, 30) || 'error';
  if (!['error', 'ticket'].includes(reportKind)) {
    return res.status(400).json({ error: 'Invalid report kind' });
  }

  const ticketCategory = clip(req.body?.ticketCategory, 50);
  if (reportKind === 'ticket' && !ticketCategory) {
    return res.status(400).json({ error: 'Ticket category is required' });
  }

  const reporter = await resolveReporter(req, req.body?.reporterEmail);
  const report = await errorReportQueries.create({
    reportKind,
    ticketCategory: reportKind === 'ticket' ? ticketCategory : null,
    source: clip(req.body?.source, 50) || (reporter.adminContext ? 'admin' : 'frontend'),
    severity: clip(req.body?.severity, 30) || (reportKind === 'ticket' ? 'info' : 'error'),
    message,
    errorType: clip(req.body?.errorType, 255),
    stack: clip(req.body?.stack, 16000),
    componentStack: clip(req.body?.componentStack, 12000),
    fingerprint: clip(req.body?.fingerprint, 255),
    pageUrl: clip(req.body?.pageUrl, 2000),
    routePath: clip(req.body?.routePath, 1000),
    userAgent: clip(req.headers['user-agent'] || req.body?.userAgent, 2000),
    reporterEmail: reporter.reporterEmail,
    userId: reporter.userId,
    adminContext: reporter.adminContext,
    context: sanitizeContext(req.body?.context),
  });

  res.status(201).json({ id: report.id, status: report.status });
});

module.exports = router;
