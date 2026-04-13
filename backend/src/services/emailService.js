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

module.exports = { sendPasswordReset };
