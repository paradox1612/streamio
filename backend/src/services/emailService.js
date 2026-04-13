const { Resend } = require('resend');
const { baseTemplate, ctaButton, fallbackUrl } = require('./emailTemplates');

// Lazy-init so tests that mock this module never instantiate the client
let _resend = null;
function getClient() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = () => process.env.RESEND_FROM_EMAIL || 'noreply@thekush.dev';

// ── Email senders ──────────────────────────────────────────────────────────────

async function sendPasswordReset(toEmail, resetLink) {
  const html = baseTemplate({
    badge: 'Password Reset',
    title: 'Reset your password',
    body: `
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:rgba(148,163,184,0.65);">
        We received a request to reset your StreamBridge password.
        This link expires in <strong style="color:rgba(148,163,184,0.9);">1 hour</strong>.
        If you didn't request this, you can safely ignore this email.
      </p>
      ${ctaButton(resetLink, 'Reset Password')}
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:8px 0 16px;" />
      ${fallbackUrl(resetLink)}
    `,
  });

  return getClient().emails.send({
    from: FROM(),
    to: toEmail,
    subject: 'Reset your StreamBridge password',
    html,
  });
}

async function sendOrderConfirmation(toEmail, { offeringName, m3uUrl, xtreamInfo, loginLink }) {
  const html = baseTemplate({
    badge: 'Order Placed',
    title: 'Your access is ready.',
    body: `
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:rgba(148,163,184,0.65);">
        Thanks for your purchase! Your <strong style="color:#fff;">${offeringName}</strong> subscription is now active.
      </p>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:rgba(148,163,184,0.4);">Xtream / Player API</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:rgba(148,163,184,0.8);">
          <tr>
            <td style="padding:4px 0;width:80px;color:rgba(148,163,184,0.5);">Host</td>
            <td style="padding:4px 0;font-family:monospace;color:#fff;">${xtreamInfo.host}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:rgba(148,163,184,0.5);">Username</td>
            <td style="padding:4px 0;font-family:monospace;color:#fff;">${xtreamInfo.username}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:rgba(148,163,184,0.5);">Password</td>
            <td style="padding:4px 0;font-family:monospace;color:#fff;">${xtreamInfo.password}</td>
          </tr>
        </table>
      </div>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:rgba(148,163,184,0.4);">M3U Playlist URL</p>
        <p style="margin:0;font-size:11px;font-family:monospace;word-break:break-all;color:#42a4ff;">${m3uUrl}</p>
      </div>

      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:rgba(148,163,184,0.65);">
        You can also manage your subscription and watch content directly in our web player:
      </p>
      ${ctaButton(loginLink, 'Go to Provider')}
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:8px 0 16px;" />
      ${fallbackUrl(loginLink)}
    `,
  });

  return getClient().emails.send({
    from: FROM(),
    to: toEmail,
    subject: `Order Confirmation: ${offeringName}`,
    html,
  });
}

module.exports = { sendPasswordReset, sendOrderConfirmation };
