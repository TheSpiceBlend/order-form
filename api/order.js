/**
 * Vercel Serverless Function — POST /api/order
 * ─────────────────────────────────────────────
 * Environment variables required in Vercel dashboard:
 *   RESEND_API_KEY              → your Resend API key
 *   ADMIN_EMAIL                 → your email (order alerts)
 *   FROM_EMAIL                  → verified sender in Resend
 *   GOOGLE_SHEET_ID             → your Google Sheet ID
 *   GOOGLE_SERVICE_ACCOUNT_KEY  → full JSON contents of service account key
 */

const { Resend } = require('resend');
const { google } = require('googleapis');

const resend      = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const FROM_EMAIL  = process.env.FROM_EMAIL;
const SHEET_ID    = process.env.GOOGLE_SHEET_ID;

// ── Google Sheets auth ───────────────────────────────────────────────────────
async function getSheetClient() {
  const keyJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials: keyJson,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// ── Append order row to Google Sheet ────────────────────────────────────────
async function saveToSheet({ orderRef, customer, products, total, notes, submittedAt }) {
  const sheets = await getSheetClient();

  const productSummary = products
    .map(p => `${p.name} x${p.qty} (¥${(p.price * p.qty).toLocaleString()})`)
    .join(', ');

  const date = new Date(submittedAt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  const row = [
    orderRef,
    date,
    customer.firstName,
    customer.lastName,
    customer.email,
    customer.phone || '—',
    productSummary,
    `¥${parseInt(total).toLocaleString()}`,
    notes || '—',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Sheet1!A:I',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { orderRef, customer, products, total, notes, submittedAt } = req.body;

  if (!customer?.email || !products?.length) {
    return res.status(400).json({ error: 'Invalid order data' });
  }

  if (!ADMIN_EMAIL || !FROM_EMAIL || !process.env.RESEND_API_KEY) {
    console.error('Missing environment variables');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const productRows = products.map(p =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${p.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${p.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">¥${(p.price * p.qty).toFixed(0)}</td>
    </tr>`
  ).join('');

  try {
    // ── 1. Save to Google Sheets ─────────────────────────────────────────
    await saveToSheet({ orderRef, customer, products, total, notes, submittedAt });
    console.log(`📊 Order ${orderRef} saved to Google Sheets`);

    // ── 2. Alert email to YOU (the shop owner) ───────────────────────────
    await resend.emails.send({
      from: FROM_EMAIL,
      to:   ADMIN_EMAIL,
      subject: `🛒 New order ${orderRef} — ¥${total} from ${customer.firstName} ${customer.lastName}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a18">
          <h2 style="font-size:20px;margin-bottom:4px">New order received</h2>
          <p style="color:#888;font-size:13px;margin-top:0">Ref: <strong>${orderRef}</strong> &nbsp;·&nbsp; ${new Date(submittedAt).toLocaleString()}</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
            <thead><tr style="background:#f5f5f2">
              <th style="padding:8px 12px;text-align:left;font-weight:500">Product</th>
              <th style="padding:8px 12px;text-align:center;font-weight:500">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-weight:500">Subtotal</th>
            </tr></thead>
            <tbody>${productRows}</tbody>
            <tfoot><tr>
              <td colspan="2" style="padding:10px 12px;font-weight:600">Total</td>
              <td style="padding:10px 12px;text-align:right;font-weight:600;font-size:16px">¥${total}</td>
            </tr></tfoot>
          </table>
          <table style="width:100%;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#888;width:120px">Name</td><td>${customer.firstName} ${customer.lastName}</td></tr>
            <tr><td style="padding:4px 0;color:#888">Email</td><td><a href="mailto:${customer.email}">${customer.email}</a></td></tr>
            ${customer.phone ? `<tr><td style="padding:4px 0;color:#888">Phone</td><td>${customer.phone}</td></tr>` : ''}
            ${notes ? `<tr><td style="padding:4px 0;color:#888;vertical-align:top">Notes</td><td>${notes}</td></tr>` : ''}
          </table>
        </div>`
    });

    // ── 3. Confirmation email to the BUYER ──────────────────────────────
    await resend.emails.send({
      from: FROM_EMAIL,
      to:   customer.email,
      subject: `Order confirmed — ${orderRef}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a18">
          <h2 style="font-size:20px;margin-bottom:4px">Thanks for your order, ${customer.firstName}!</h2>
          <p style="color:#888;font-size:13px">We've received your order and will be in touch soon.</p>
          <div style="background:#f5f5f2;border-radius:8px;padding:12px 16px;margin:20px 0;font-size:13px;color:#555">
            Order reference: <strong style="color:#1a1a18;font-family:monospace">${orderRef}</strong>
          </div>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
            <thead><tr style="background:#f5f5f2">
              <th style="padding:8px 12px;text-align:left;font-weight:500">Product</th>
              <th style="padding:8px 12px;text-align:center;font-weight:500">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-weight:500">Subtotal</th>
            </tr></thead>
            <tbody>${productRows}</tbody>
            <tfoot><tr>
              <td colspan="2" style="padding:10px 12px;font-weight:600">Total</td>
              <td style="padding:10px 12px;text-align:right;font-weight:600;font-size:16px">¥${total}</td>
            </tr></tfoot>
          </table>
          ${notes ? `<p style="font-size:13px;color:#888">Your notes: <em>${notes}</em></p>` : ''}
          <p style="font-size:13px;color:#aaa;margin-top:32px">Questions? Contact us at ${ADMIN_EMAIL}</p>
        </div>`
    });

    console.log(`✅ Order ${orderRef} processed`);
    return res.status(200).json({ success: true, orderRef });

  } catch (err) {
    console.error('Order processing error:', err);
    return res.status(500).json({ error: 'Failed to process order' });
  }
}
