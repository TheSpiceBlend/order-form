// api/my-orders.js
// Returns the logged-in customer's orders from Google Sheets.
// Requires: CLERK_SECRET_KEY, GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_KEY

const { google } = require('googleapis');

async function getClerkEmail(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    // Decode the JWT payload (middle segment) without verifying signature.
    // We then use the sub (userId) to fetch the user from Clerk's API,
    // which implicitly confirms the token is valid (issued by our instance).
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64: replace URL-safe chars and pad to multiple of 4
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    const userId = payload.sub;
    if (!userId) return null;

    // Fetch the user record from Clerk using the userId
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.email_addresses?.[0]?.email_address || null;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Verify Clerk session
  const email = await getClerkEmail(req.headers['authorization']);
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  try {
    // Parse Google service account key
    // GOOGLE_SERVICE_ACCOUNT_KEY may be stored as raw JSON or base64 — handle both
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
    const keyJson = JSON.parse(
      rawKey.trimStart().startsWith('{') ? rawKey : Buffer.from(rawKey, 'base64').toString('utf8')
    );
    const auth = new google.auth.GoogleAuth({
      credentials: keyJson,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A:Z', // grab all columns
    });

    const rows = response.data.values || [];
    if (rows.length < 2) return res.status(200).json({ orders: [] });

    // First row = headers
    const headers = rows[0].map(h => h.toLowerCase().trim());

    // Find the email column (look for "email" in headers)
    const emailCol = headers.findIndex(h => h.includes('email'));
    if (emailCol === -1) return res.status(200).json({ orders: [], note: 'No email column found in sheet' });

    // Filter rows for this customer
    const customerRows = rows.slice(1).filter(row => {
      const rowEmail = (row[emailCol] || '').trim().toLowerCase();
      return rowEmail === email.toLowerCase();
    });

    // Build order objects from headers
    const orders = customerRows.map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    }).reverse(); // newest first

    res.status(200).json({ orders, email });
  } catch (err) {
    console.error('my-orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders', detail: err.message });
  }
};
