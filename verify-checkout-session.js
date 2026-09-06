// ============================================================
// Service Radar – Vercel Serverless Function
// GET /api/verify-checkout-session?session_id=cs_...
//     + Authorization: Bearer <Supabase Access Token>
// ------------------------------------------------------------
// Prueft SERVERSEITIG bei Stripe, ob eine Checkout-Session wirklich bezahlt
// wurde – und schaltet den zugehoerigen Auftrag im selben Schritt live.
//
// Wichtiger Unterschied zur frueheren Version:
//   Frueher gab diese Route nur { paid: true } zurueck und der BROWSER hat den
//   Auftrag danach selbst angelegt. Eine gespeicherte Success-URL konnte damit
//   beliebig oft neue Auftraege veroeffentlichen.
//   Jetzt veroeffentlicht ausschliesslich der Server, gebunden an
//   metadata.job_id + jobs.stripe_session_id, und die Session wird durch
//   status='pending' -> 'active' atomar verbraucht.
//
// Der Client erfaehrt nur noch das Ergebnis. { paid: true } allein bewirkt nichts.
// Nutzt ausschliesslich serverseitige Keys (STRIPE_SECRET_KEY, SERVICE_ROLE).
// ============================================================
const Stripe = require('stripe');
const { verifyUser, activatePaidJob } = require('./_pay');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY ist nicht gesetzt.' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (Vercel ENV).' });
  }

  // ── 1) Aufrufer authentifizieren ────────────────────────────
  // Ohne gueltiges Token wird gar nichts veroeffentlicht. Eine session_id
  // allein ist keine Berechtigung mehr.
  const caller = await verifyUser(req);
  if (!caller) {
    return res.status(401).json({ paid: false, published: false, code: 'unauthenticated', error: 'Nicht angemeldet.' });
  }

  // Token steht im Header, nicht in der URL – die session_id enthaelt keine
  // personenbezogenen Daten.
  let sessionId = (req.query && req.query.session_id) || '';
  if (!sessionId && req.url) {
    try { sessionId = new URL(req.url, 'http://x').searchParams.get('session_id') || ''; } catch (e) {}
  }
  sessionId = String(sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'session_id erforderlich' });
  // Stripe-Session-IDs haben ein festes Format – offensichtlichen Unsinn sofort ablehnen.
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return res.status(400).json({ paid: false, published: false, code: 'invalid_session', error: 'Ungueltige session_id.' });
  }

  const stripe = Stripe(secret);

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error('[verify-checkout-session] retrieve', err && err.message);
    return res.status(404).json({ paid: false, published: false, code: 'invalid_session', error: 'Session nicht gefunden.' });
  }

  // ── 2) Zahlung pruefen und Auftrag atomar freischalten ──────
  let r;
  try {
    r = await activatePaidJob(session, caller.id);
  } catch (err) {
    console.error('[verify-checkout-session] activate', err && err.message);
    return res.status(500).json({ paid: true, published: false, code: 'db_error', error: 'Auftrag konnte nicht veroeffentlicht werden.' });
  }

  const paid = session.payment_status === 'paid';

  if (r.ok) {
    return res.status(200).json({
      paid: true,
      published: true,
      code: r.code,                       // 'published' | 'already_published'
      job_id: (r.job && r.job.id) || null,
      amount_total: session.amount_total,
      currency: session.currency
    });
  }

  const messages = {
    not_paid:   'Die Zahlung ist nicht bestaetigt.',
    no_job_ref: 'Zu dieser Zahlung ist kein Auftrag hinterlegt.',
    forbidden:  'Diese Zahlung gehoert zu einem anderen Konto.',
    mismatch:   'Zahlung und Auftrag passen nicht zusammen.',
    db_error:   'Auftrag konnte nicht veroeffentlicht werden.'
  };
  return res.status(r.status || 409).json({
    paid: paid,
    published: false,
    code: r.code,
    error: messages[r.code] || 'Veroeffentlichung nicht moeglich.'
  });
};
