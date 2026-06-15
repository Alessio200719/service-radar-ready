// ============================================================
// Service Radar – Vercel Serverless Function
// GET /api/vapid-public-key
// Liefert den ÖFFENTLICHEN VAPID-Key ans Frontend (zum Subscriben).
// Der PRIVATE Key bleibt ausschließlich serverseitig.
// ============================================================
module.exports = async function handler(req, res) {
  const key = process.env.VAPID_PUBLIC_KEY || '';
  if (!key) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY nicht gesetzt.' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({ publicKey: key });
};
