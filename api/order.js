/**
 * Vercel Serverless Function — POST /api/order
 * ─────────────────────────────────────────────
 * Saves an order to Google Sheets and sends confirmation emails.
 *
 * Environment variables required:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  → JSON string of the service account key
 *   GOOGLE_SHEET_ID             → ID of the target Google Sheet
 *   RESEND_API_KEY              → Resend API key for email
 *   FROM_EMAIL                  → Sender email address (e.g. orders@thespiceblend.com)
 *   ADMIN_EMAIL                 → Admin/owner email to receive order notifications
 *   CLERK_SECRET_KEY             → Clerk secret key used to verify session tokens
 *   CLERK_AUTHORIZED_PARTIES     → Optional comma-separated allowed Clerk origins
 *                                  (recommended: https://thespiceblend.com)
 */

import { google } from 'googleapis';
import { verifyToken } from '@clerk/backend';

async function getAuthenticatedUserId(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  if (!token || !process.env.CLERK_SECRET_KEY) return null;

  try {
    const authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      ...(authorizedParties.length ? { authorizedParties } : {}),
    });

    return payload?.sub || null;
  } catch (err) {
    console.error('Clerk token verification failed:', err);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    orderRef,
    customer,   // { firstName, lastName, email, phone }
    products,   // [{ id, name, price, qty }]
    total,
    notes,      // top-level string
    submittedAt,
  } = req.body || {};

  // ── Authenticate the signed-in Clerk user ────────────────────────────────
  const clerkUserId = await getAuthenticatedUserId(req);
  if (!clerkUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // ── Validate required fields ──────────────────────────────────────────────
  if (!orderRef || !customer?.email || !products?.length || !total) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }

  // Build a display name from firstName + lastName
  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email;

  // ── 1. Append to Google Sheet ─────────────────────────────────────────────
  try {
    const keyJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.GoogleAuth({
      credentials: keyJson,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Build a summary of items for the sheet
    const itemsSummary = products
      .map(p => `${p.name} x${p.qty} (¥${(p.price * p.qty).toLocaleString()})`)
      .join(' | ');

    // Keep the existing A:I order columns unchanged and store the Clerk user ID
    // in the first available column from J onward. This avoids changing any
    // existing order fields.
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A:Z',
    });

    const headerRow = headerResponse.data.values?.[0] || [];
    const normalizedHeaders = headerRow.map(h => String(h || '').trim().toLowerCase());

    let clerkUserIdCol = -1;
    for (let i = 9; i < normalizedHeaders.length; i++) {
      if (['clerkuserid', 'clerk user id', 'clerk_user_id'].includes(normalizedHeaders[i])) {
        clerkUserIdCol = i;
        break;
      }
    }

    if (clerkUserIdCol === -1) {
      // Prefer J (index 9). If J already has another header, use the first
      // empty column after J.
      clerkUserIdCol = 9;
      while (clerkUserIdCol < normalizedHeaders.length && normalizedHeaders[clerkUserIdCol]) {
        clerkUserIdCol++;
      }

      const columnLetter = (() => {
        let n = clerkUserIdCol + 1;
        let s = '';
        while (n > 0) {
          const rem = (n - 1) % 26;
          s = String.fromCharCode(65 + rem) + s;
          n = Math.floor((n - 1) / 26);
        }
        return s;
      })();

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Sheet1!${columnLetter}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['clerkUserId']] },
      });
    }

    const row = [
      orderRef,
      submittedAt || new Date().toISOString(),
      customerName,
      customer.email,
      customer.phone || '',
      notes || '',
      itemsSummary,
      `¥${Number(total).toLocaleString()}`,
      'New',
    ];

    while (row.length < clerkUserIdCol) row.push('');
    row[clerkUserIdCol] = clerkUserId;

    const endCol = (() => {
      let n = row.length;
      let s = '';
      while (n > 0) {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    })();

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Sheet1!A:${endCol}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  } catch (err) {
    console.error('Google Sheets error:', err);
    return res.status(500).json({ error: 'Failed to save order', detail: err.message });
  }

  // ── 2. Send emails via Resend ─────────────────────────────────────────────
  const itemsHtml = products
    .map(p => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e8f5e9;font-size:14px;">${p.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e8f5e9;text-align:center;font-size:14px;">×${p.qty}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e8f5e9;text-align:right;font-size:14px;font-weight:600;">¥${(p.price * p.qty).toLocaleString()}</td>
      </tr>`)
    .join('');

  const customerEmailHtml = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f9f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1a6b30,#2d8a3d);padding:28px 32px;text-align:center;">
      <div style="font-size:2rem;margin-bottom:8px;">🍛</div>
      <h1 style="margin:0;color:white;font-size:20px;font-weight:700;">The Spice Blend</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Kerala flavours in Tokyo</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#1a3a1a;margin:0 0 6px;">Hi ${customerName},</p>
      <p style="font-size:14px;color:#444;margin:0 0 24px;">Thanks for your order! We've received it and will be in touch shortly to confirm pickup/delivery details.</p>

      <div style="background:#f4f9f4;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Order reference</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#1a6b30;letter-spacing:0.05em;">${orderRef}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.06em;padding-bottom:8px;">Item</th>
            <th style="text-align:center;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.06em;padding-bottom:8px;">Qty</th>
            <th style="text-align:right;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.06em;padding-bottom:8px;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div style="text-align:right;padding-top:8px;border-top:2px solid #1a6b30;">
        <span style="font-size:13px;color:#666;">Total: </span>
        <span style="font-size:18px;font-weight:700;color:#1a6b30;">¥${Number(total).toLocaleString()}</span>
      </div>

      ${notes ? `<p style="font-size:13px;color:#555;margin:20px 0 0;"><strong>Notes:</strong> ${notes}</p>` : ''}

      <p style="font-size:13px;color:#888;margin:24px 0 0;line-height:1.6;">If you have any questions, just reply to this email.<br>We'll see you soon! 🌶️</p>
    </div>
    <div style="padding:16px 32px;background:#f4f9f4;text-align:center;border-top:1px solid #e8f5e9;">
      <p style="margin:0;font-size:11px;color:#aaa;">The Spice Blend · Tokyo · thespiceblend.com</p>
    </div>
  </div>
</body>
</html>`;

  const adminEmailHtml = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;padding:20px;color:#333;">
  <h2 style="color:#1a6b30;">🛒 New Order: ${orderRef}</h2>
  <p><strong>Customer:</strong> ${customerName} &lt;${customer.email}&gt;</p>
  ${customer.phone ? `<p><strong>Phone:</strong> ${customer.phone}</p>` : ''}
  ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
  <hr style="border:1px solid #e8f5e9;margin:16px 0;">
  <table style="width:100%;border-collapse:collapse;">
    ${products.map(p => `
    <tr>
      <td style="padding:6px 0;">${p.name}</td>
      <td style="padding:6px 0;text-align:center;">×${p.qty}</td>
      <td style="padding:6px 0;text-align:right;font-weight:600;">¥${(p.price * p.qty).toLocaleString()}</td>
    </tr>`).join('')}
    <tr style="border-top:2px solid #1a6b30;">
      <td colspan="2" style="padding-top:8px;font-weight:700;">TOTAL</td>
      <td style="padding-top:8px;text-align:right;font-weight:700;font-size:16px;color:#1a6b30;">¥${Number(total).toLocaleString()}</td>
    </tr>
  </table>
  <p style="font-size:12px;color:#999;margin-top:20px;">Submitted: ${submittedAt || new Date().toISOString()}</p>
</body>
</html>`;

  const emailErrors = [];

  // Send confirmation to customer
  try {
    const custRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL,
        to: customer.email,
        subject: `Your order is confirmed — ${orderRef} 🍛`,
        reply_to: process.env.ADMIN_EMAIL,
        html: customerEmailHtml,
      }),
    });
    if (!custRes.ok) {
      const body = await custRes.text();
      emailErrors.push(`Customer email: ${body}`);
    }
  } catch (err) {
    emailErrors.push(`Customer email: ${err.message}`);
  }

  // Send notification to admin
  try {
    const adminRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL,
        to: process.env.ADMIN_EMAIL,
        subject: `New order: ${orderRef} from ${customerName}`,
        html: adminEmailHtml,
      }),
    });
    if (!adminRes.ok) {
      const body = await adminRes.text();
      emailErrors.push(`Admin email: ${body}`);
    }
  } catch (err) {
    emailErrors.push(`Admin email: ${err.message}`);
  }

  // Log email errors but don't fail the order — it's already in the sheet
  if (emailErrors.length) {
    console.warn('Email send issues:', emailErrors);
  }

  return res.status(200).json({
    success: true,
    orderRef,
    emailWarnings: emailErrors.length ? emailErrors : undefined,
  });
}
