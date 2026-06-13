// ============================================================
// Service Radar – Vercel Serverless Function (OPTIONAL)
// POST /api/stripe-webhook   (Event: checkout.session.completed)
// ------------------------------------------------------------
// Dieser Webhook ist OPTIONAL. Der Standard-Ablauf veröffentlicht den
// Auftrag bereits zuverlässig im Frontend, nachdem /api/verify-checkout-session
// die Zahlung bestätigt hat. Der Webhook dient als zusätzliche, serverseitige
// Absicherung (z. B. falls der Nutzer den Tab nach der Zahlung sofort schließt).
//
// Signaturprüfung über STRIPE_WEBHOOK_SECRET (raw body erforderlich → bodyParser aus).
//
// Serverseitiges Veröffentlichen ist standardmäßig AUS, um Doppel-
// Veröffentlichung mit dem Frontend zu vermeiden. Zum Aktivieren:
//   1. ENV setzen: PUBLISH_VIA_WEBHOOK=true, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   2. Im Frontend die Client-Veröffentlichung deaktivieren
//   3. Auftrag zuvor als status='pending' speichern und in der Stripe-Session
//      metadata.job_id mitgeben – der Webhook setzt ihn dann auf 'active'.
//   (Der SERVICE-ROLE-Key darf NUR hier serverseitig stehen, nie im Frontend.)
// ============================================================
const Stripe = require('stripe');

const handler = async function (req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }

  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whSecret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY und/oder STRIPE_WEBHOOK_SECRET fehlen.' });
  }
  const stripe = Stripe(secret);

  let event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signaturprüfung fehlgeschlagen:', err && err.message);
    return res.status(400).send('Webhook Error: ' + (err && err.message));
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('[stripe-webhook] bezahlt:', session.id, session.metadata || {});

    // ── OPTIONAL: serverseitig veröffentlichen ──────────────────────────────
    if (process.env.PUBLISH_VIA_WEBHOOK === 'true' &&
        process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY &&
        session.metadata && session.metadata.job_id) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        // Setzt einen zuvor als 'pending' gespeicherten Auftrag auf 'active'
        // (idempotent – mehrfaches Ausführen schadet nicht).
        const { error } = await sb.from('jobs')
          .update({ status: 'active' })
          .eq('id', session.metadata.job_id);
        if (error) console.error('[stripe-webhook] Supabase update Fehler:', error.message);
        else console.log('[stripe-webhook] Auftrag aktiviert:', session.metadata.job_id);
      } catch (e) {
        console.error('[stripe-webhook] Veröffentlichung fehlgeschlagen:', e && e.message);
      }
    }
  }

  return res.status(200).json({ received: true });
};

// Stripe braucht den ROHEN Request-Body für die Signaturprüfung:
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
