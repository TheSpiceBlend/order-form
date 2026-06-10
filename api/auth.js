/**
 * Vercel Serverless Function — POST /api/auth
 * ─────────────────────────────────────────────
 * Verifies the password securely on the backend.
 *
 * Add this environment variable in Vercel dashboard:
 *   FORM_PASSWORD  → your chosen password (e.g. spice2024)
 *   SESSION_SECRET → a random secret string (e.g. any 32 random characters)
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  const FORM_PASSWORD  = process.env.FORM_PASSWORD;
  const SESSION_SECRET = process.env.SESSION_SECRET;

  if (!FORM_PASSWORD || !SESSION_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  // Compare password
  if (password !== FORM_PASSWORD) {
    // Small delay to slow down brute force attempts
    await new Promise(r => setTimeout(r, 500));
    return res.status(401).json({ error: 'Incorrect password' });
  }

  // Generate a simple session token: base64(timestamp + secret)
  const payload = `${Date.now()}:${SESSION_SECRET}`;
  const token = Buffer.from(payload).toString('base64');

  return res.status(200).json({ token });
}
