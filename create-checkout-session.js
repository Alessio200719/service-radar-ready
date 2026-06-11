// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/create-checkout-session
// Erstellt eine Stripe Checkout Session (gehostete Bezahlseite).
// PREIS UND PRODUKT WERDEN HIER SERVERSEITIG FIXIERT – der Client kann
// den Betrag NICHT manipulieren. Es wird ausschließlich der GEHEIME
// Stripe-Key aus der Vercel-Umgebungsvariable STRIPE_SECRET_KEY genutzt.
// (Niemals den Secret Key ins Frontend legen.)
// ============================================================
const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY ist nicht gesetzt (Vercel → Settings → Environment Variables).' });
  }
  const stripe = Stripe(secret);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const jobTitle  = (body.jobTitle  || '').toString().slice(0, 250);
    const userEmail = (body.userEmail || '').toString().slice(0, 250);

    // Basis-URL für Rück-Weiterleitungen: feste SITE_URL bevorzugen, sonst Request-Host.
    const origin =
      (process.env.SITE_URL && process.env.SITE_URL.replace(/\/+$/, '')) ||
      (req.headers.origin) ||
      ('https://' + req.headers.host);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Preis 2,00 EUR, Produktname fix – serverseitig, nicht vom Client beeinflussbar.
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: 200, // 2,00 EUR in Cent
          product_data: { name: 'Service Radar Inseratsgebühr' }
        }
      }],
      ...(userEmail ? { customer_email: userEmail } : {}),
      success_url: origin + '/?sr_pay=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  origin + '/?sr_pay=cancel',
      metadata: {
        kind: 'inseratsgebuehr',
        job_title: jobTitle,
        user_email: userEmail
      }
    });

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('[create-checkout-session]', err && err.message);
    return res.status(500).json({ error: (err && err.message) || 'Stripe error' });
  }
};
