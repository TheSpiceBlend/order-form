/**
 * Vercel Serverless Function — POST /api/access-request
 * ─────────────────────────────────────────────
 * Sends an email to the admin when someone requests access
 * to the password-protected order form.
 *
 * Reuses the same environment variables as api/order.js:
 *   RESEND_API_KEY → your Resend API key
 *   ADMIN_EMAIL    → one or more emails comma-separated (e.g. a@x.com,b@x.com)
 *   FROM_EMAIL     → verified sender in Resend
 */

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim()).filter(Boolean);
const FROM_EMAIL = process.env.FROM_EMAIL;

// Very small in-memory rate limit per cold start (best-effort, resets on redeploy)
const recentRequests = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, message } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  // Basic email format check
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  // Basic per-email throttling: 1 request per 10 minutes
  const now = Date.now();
  const last = recentRequests.get(email);
  if (last && now - last < 10 * 60 * 1000) {
    return res.status(429).json({ error: 'Please wait a few minutes before requesting again' });
  }
  recentRequests.set(email, now);

  if (!ADMIN_EMAILS.length || !FROM_EMAIL) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  // Escape basic HTML to avoid injection in the email body
  const esc = (s = '') => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAILS,
      subject: `🔑 Access request from ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fdf8f0;border-radius:12px;border:1px solid #e8dcc8">
          <p style="font-size:13px;color:#888;margin:0 0 4px">New access request for The Spice Blend</p>
          <h2 style="margin:0 0 16px;color:#1a3a2a;font-size:20px">🔑 ${esc(name)} wants access</h2>
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#1a1a18">
            <tr><td style="padding:6px 0;color:#888;width:90px">Name</td><td style="padding:6px 0">${esc(name)}</td></tr>
            <tr><td style="padding:6px 0;color:#888">Email</td><td style="padding:6px 0">${esc(email)}</td></tr>
            ${message ? `<tr><td style="padding:6px 0;color:#888;vertical-align:top">Message</td><td style="padding:6px 0">${esc(message)}</td></tr>` : ''}
          </table>
          <p style="font-size:12px;color:#aaa;margin-top:20px">Reply directly to this email to respond to ${esc(name)}, or send them the password through your usual channel.</p>
        </div>
      `,
      reply_to: email,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Access request email failed:', err);
    return res.status(500).json({ error: 'Failed to send request. Please try again.' });
  }
}
