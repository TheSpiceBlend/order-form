/**
 * Vercel Serverless Function — POST /api/auth
 * ─────────────────────────────────────────────
 * Verifies the password securely on the backend.
 *
 * Environment variables in Vercel dashboard:
 *   FORM_PASSWORD   → primary password (e.g. spice2024)
 *   FORM_PASSWORD_2 → additional password (e.g. daddy123)
 *   SESSION_SECRET  → a random secret string (e.g. any 32 random characters)
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  const FORM_PASSWORD   = process.env.FORM_PASSWORD;
  const FORM_PASSWORD_2 = process.env.FORM_PASSWORD_2;
  const SESSION_SECRET  = process.env.SESSION_SECRET;

  if (!FORM_PASSWORD || !SESSION_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  // Accept any valid password
  const validPasswords = [FORM_PASSWORD, FORM_PASSWORD_2].filter(Boolean);
  if (!validPasswords.includes(password)) {
    // Small delay to slow down brute force attempts
    await new Promise(r => setTimeout(r, 500));
    return res.status(401).json({ error: 'Incorrect password' });
  }

  // Generate a simple session token: base64(timestamp + secret)
  const payload = `${Date.now()}:${SESSION_SECRET}`;
  const token = Buffer.from(payload).toString('base64');

  return res.status(200).json({ token });
}
