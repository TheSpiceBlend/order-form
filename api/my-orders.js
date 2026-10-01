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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const clerkUserId = await getAuthenticatedUserId(req);
  if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

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

    const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
    const clerkUserIdCol = headers.findIndex(
      h => h === 'clerkuserid' || h === 'clerk user id' || h === 'clerk_user_id'
    );

    if (clerkUserIdCol === -1) {
      return res.status(200).json({
        orders: [],
        note: 'No clerkUserId column found. New orders will create this column automatically.'
      });
    }

    const customerRows = rows.slice(1).filter(row =>
      (row[clerkUserIdCol] || '').trim() === clerkUserId
    );

    const orders = customerRows.map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    }).reverse(); // newest first

    return res.status(200).json({ orders });
  } catch (err) {
    console.error('my-orders error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders', detail: err.message });
  }
}
