/**
 * Vercel Serverless Function — GET/POST /api/verify
 * ──────────────────────────────────────────────────
 * Verifies a Clerk session token server-side.
 * The order form calls this to confirm the user is logged in
 * before allowing order submission.
 *
 * Environment variables required:
 *   CLERK_SECRET_KEY  → your Clerk secret key (sk_live_...)
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get the session token from Authorization header or body
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim()
    || req.body?.sessionToken
    || '';

  if (!token) {
    return res.status(401).json({ authenticated: false, error: 'No session token provided' });
  }

  const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
  if (!CLERK_SECRET_KEY) {
    console.error('CLERK_SECRET_KEY not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    // Verify the token with Clerk's backend API
    const clerkResponse = await fetch('https://api.clerk.com/v1/sessions/' + token + '/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (clerkResponse.ok) {
      const sessionData = await clerkResponse.json();
      return res.status(200).json({
        authenticated: true,
        userId: sessionData.user_id,
        sessionId: sessionData.id,
      });
    } else {
      return res.status(401).json({ authenticated: false, error: 'Invalid or expired session' });
    }
  } catch (err) {
    console.error('Clerk verify error:', err);
    return res.status(500).json({ error: 'Failed to verify session' });
  }
}
