/**
 * Vercel Serverless Function — POST /api/access-request
 * ─────────────────────────────────────────────────────
 * Sends an email to the admin when someone requests access.
 *
 * Environment variables required:
 *   RESEND_API_KEY → your Resend API key
 *   ADMIN_EMAIL    → one or more emails comma-separated
 *   FROM_EMAIL     → verified sender in Resend
 */

const ADMIN_EMAILS_RAW = process.env.ADMIN_EMAIL || '';
const FROM_EMAIL = process.env.FROM_EMAIL;

const recentRequests = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, message } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  const now = Date.now();
  const last = recentRequests.get(email);
  if (last && now - last < 10 * 60 * 1000) {
    return res.status(429).json({ error: 'Please wait a few minutes before requesting again' });
  }
  recentRequests.set(email, now);

  const adminEmails = ADMIN_EMAILS_RAW.split(',').map(e => e.trim()).filter(Boolean);
  if (!adminEmails.length || !FROM_EMAIL) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const esc = (s = '') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: adminEmails,
        reply_to: email,
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
            <p style="font-size:12px;color:#aaa;margin-top:20px">Reply to this email to respond to ${esc(name)}.</p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.text();
      throw new Error(body);
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Access request email failed:', err);
    return res.status(500).json({ error: 'Failed to send request. Please try again.' });
  }
}
