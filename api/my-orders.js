/**
 * Vercel Serverless Function — GET /api/my-orders
 * ─────────────────────────────────────────────────
 * Returns the logged-in customer's orders from Google Sheets.
 *
 * Environment variables required:
 *   CLERK_SECRET_KEY            → Clerk secret key (sk_live_...)
 *   GOOGLE_SHEET_ID             → ID of the target Google Sheet
 *   GOOGLE_SERVICE_ACCOUNT_KEY  → JSON string of the service account key
 */

import { google } from 'googleapis';

async function getClerkEmail(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    // Decode JWT payload to get userId (sub), then fetch user from Clerk API
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    const userId = payload.sub;
    if (!userId) return null;

    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.email_addresses?.[0]?.email_address || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const email = await getClerkEmail(req.headers['authorization']);
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  try {
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
      range: 'Sheet1!A:Z',
    });

    const rows = response.data.values || [];
    if (rows.length < 2) return res.status(200).json({ orders: [] });

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const emailCol = headers.findIndex(h => h.includes('email'));
    if (emailCol === -1) return res.status(200).json({ orders: [], note: 'No email column found' });

    const customerRows = rows.slice(1).filter(row =>
      (row[emailCol] || '').trim().toLowerCase() === email.toLowerCase()
    );

    const orders = customerRows.map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    }).reverse(); // newest first

    return res.status(200).json({ orders, email });
  } catch (err) {
    console.error('my-orders error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders', detail: err.message });
  }
}
