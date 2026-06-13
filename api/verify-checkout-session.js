// ============================================================
// Service Radar – Vercel Serverless Function
// GET /api/verify-checkout-session?session_id=cs_...
// Prüft SERVERSEITIG bei Stripe, ob eine Checkout-Session wirklich
// bezahlt wurde (payment_status === 'paid'). Erst wenn { paid: true }
// zurückkommt, darf das Frontend den Auftrag in Supabase veröffentlichen.
// Nutzt nur den geheimen STRIPE_SECRET_KEY (serverseitig).
// ============================================================
const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY ist nicht gesetzt.' });
  }
  const stripe = Stripe(secret);

  const sessionId = (req.query && req.query.session_id) ||
    (req.url && (new URL(req.url, 'http://x')).searchParams.get('session_id')) || '';
  if (!sessionId) {
    return res.status(400).json({ error: 'session_id erforderlich' });
  }

  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    return res.status(200).json({
      paid: s.payment_status === 'paid',
      payment_status: s.payment_status,
      amount_total: s.amount_total,
      currency: s.currency,
      metadata: s.metadata || {}
    });
  } catch (err) {
    console.error('[verify-checkout-session]', err && err.message);
    return res.status(500).json({ error: (err && err.message) || 'Stripe error' });
  }
};
