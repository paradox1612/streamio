/**
 * @file emailTemplates.js
 * @description Shared HTML email template system for StreamBridge.
 *
 * All transactional emails are built from three exported helpers:
 *
 *   baseTemplate(opts)      — full branded email shell (logo, card, footer)
 *   ctaButton(url, label)   — gradient call-to-action button
 *   fallbackUrl(url)        — plain-text URL fallback below the button
 *
 * ─── Adding a new email ────────────────────────────────────────────────────────
 *
 * 1. Add a new sender function in emailService.js:
 *
 *   const { baseTemplate, ctaButton, fallbackUrl } = require('./emailTemplates');
 *
 *   async function sendWelcome(toEmail, dashboardUrl) {
 *     const html = baseTemplate({
 *       badge: 'Welcome',
 *       title: 'You\'re in.',
 *       body: `
 *         <p style="...">Welcome to StreamBridge! Your account is ready.</p>
 *         ${ctaButton(dashboardUrl, 'Go to Dashboard')}
 *         ${fallbackUrl(dashboardUrl)}
 *       `,
 *     });
 *     return getClient().emails.send({
 *       from: FROM(),
 *       to: toEmail,
 *       subject: 'Welcome to StreamBridge',
 *       html,
 *     });
 *   }
 *
 * 2. Export it: module.exports = { sendPasswordReset, sendWelcome };
 *
 * 3. Mock it in any unit test that imports authService or a service that calls it:
 *
 *   jest.mock('../../src/services/emailService', () => ({
 *     sendPasswordReset: jest.fn().mockResolvedValue({}),
 *     sendWelcome:       jest.fn().mockResolvedValue({}),
 *   }));
 *
 * ─── Template anatomy ─────────────────────────────────────────────────────────
 *
 *   ┌────────────────────────────────┐
 *   │  [logo]  StreamBridge          │  ← always rendered, not configurable
 *   ├────────────────────────────────┤
 *   │  BADGE (optional small label)  │  ← opts.badge
 *   │  Title                         │  ← opts.title
 *   │  ...body HTML...               │  ← opts.body  (paragraphs, button, etc.)
 *   ├────────────────────────────────┤
 *   │  © 2025 StreamBridge           │  ← opts.footer appended here (optional)
 *   └────────────────────────────────┘
 *
 * ─── Design tokens ────────────────────────────────────────────────────────────
 *
 *   Background  #050816  (surface-950)
 *   Card        rgba(18,28,49,0.95) → rgba(8,16,31,0.9) gradient
 *   Brand blue  #1491ff → #42a4ff → #67e8f9 (CTA button gradient)
 *   Text        #ffffff / rgba(148,163,184,0.65) secondary / 0.4 muted
 *
 * NOTE: All styles are inline — email clients do not support external CSS or
 * Tailwind classes. Keep any new content inline as well.
 */

const BRAND_BLUE = '#1491ff';
const BRAND_CYAN = '#42a4ff';
const BRAND_LIGHT_CYAN = '#67e8f9';
const BG = '#050816';
const CARD_BG = 'linear-gradient(180deg,rgba(18,28,49,0.95),rgba(8,16,31,0.9))';
const CARD_BORDER = 'rgba(255,255,255,0.1)';
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = 'rgba(148,163,184,0.65)';
const TEXT_MUTED = 'rgba(148,163,184,0.4)';
const DIVIDER = 'rgba(255,255,255,0.08)';

// ── Logo crosshair icon ────────────────────────────────────────────────────────
const LOGO_HTML = `
<table cellpadding="0" cellspacing="0">
  <tr>
    <td style="vertical-align:middle;padding-right:12px;">
      <div style="width:48px;height:48px;border-radius:18px;border:1px solid ${CARD_BORDER};background:rgba(255,255,255,0.04);text-align:center;line-height:48px;">
        <div style="display:inline-block;width:20px;height:20px;border-radius:50%;border:1px solid rgba(255,255,255,0.35);position:relative;vertical-align:middle;">
          <div style="position:absolute;left:50%;top:-1px;height:calc(100% + 2px);width:2px;transform:translateX(-50%);background:rgba(255,255,255,0.7);"></div>
          <div style="position:absolute;left:-1px;top:50%;height:2px;width:calc(100% + 2px);transform:translateY(-50%);background:rgba(255,255,255,0.7);"></div>
        </div>
      </div>
    </td>
    <td style="vertical-align:middle;">
      <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:rgba(178,219,255,0.72);">StreamBridge</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:${TEXT_PRIMARY};">thekush.dev</p>
    </td>
  </tr>
</table>`;

/**
 * Renders a branded CTA button.
 * @param {string} url
 * @param {string} label
 */
function ctaButton(url, label) {
  return `
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:24px 0;">
      <a href="${url}"
         style="display:inline-block;padding:14px 36px;border-radius:9999px;background:linear-gradient(90deg,${BRAND_BLUE},${BRAND_CYAN},${BRAND_LIGHT_CYAN});color:${BG};font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.01em;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

/**
 * Renders a muted fallback URL block (for clients that block styled links).
 * @param {string} url
 */
function fallbackUrl(url) {
  return `
<p style="margin:8px 0 0;font-size:12px;color:${TEXT_SECONDARY};">Or copy this link into your browser:</p>
<p style="margin:4px 0 0;font-size:11px;color:${BRAND_CYAN};word-break:break-all;">${url}</p>`;
}

/**
 * Wraps content in the full StreamBridge branded email shell.
 *
 * @param {object} opts
 * @param {string} opts.badge      - Small label above the title (e.g. "Password Reset")
 * @param {string} opts.title      - Main heading inside the card
 * @param {string} opts.body       - Inner HTML content (paragraphs, buttons, etc.)
 * @param {string} [opts.footer]   - Extra footer text (appended below the copyright line)
 */
function baseTemplate({ badge, title, body, footer = '' }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

          <!-- Header: logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              ${LOGO_HTML}
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:28px;padding:40px 36px;">
              ${badge ? `<p style="margin:0 0 8px;font-size:10px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:rgba(178,219,255,0.72);">${badge}</p>` : ''}
              <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;letter-spacing:-0.04em;color:${TEXT_PRIMARY};">${title}</h1>
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};">
                &copy; ${year} StreamBridge &nbsp;&middot;&nbsp; thekush.dev
                ${footer ? `<br/>${footer}` : ''}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { baseTemplate, ctaButton, fallbackUrl };
