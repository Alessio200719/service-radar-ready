// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/stripe-webhook   (Event: checkout.session.completed)
// ------------------------------------------------------------
// Serverseitiges Sicherheitsnetz: schaltet einen bezahlten Auftrag auch dann
// live, wenn der Nutzer den Tab direkt nach der Zahlung schliesst, der Browser
// abstuerzt oder er auf einem anderen Geraet zurueckkehrt.
//
// Der Webhook benutzt exakt dieselbe Aktivierungs-Logik wie
// /api/verify-checkout-session (api/_pay.js -> activatePaidJob). Beide Wege
// sind idempotent: das UPDATE greift nur bei status='pending', deshalb kann
// eine Zahlung niemals zwei Veroeffentlichungen erzeugen – egal ob der Client,
// der Webhook oder beide gleichzeitig ankommen.
//
// Signaturpruefung ueber STRIPE_WEBHOOK_SECRET (raw body erforderlich →
// bodyParser aus). Ohne gueltige Stripe-Signatur passiert nichts.
//
// Benoetigte ENV: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//                 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (Der SERVICE-ROLE-Key darf NUR hier serverseitig stehen, nie im Frontend.)
// ============================================================
const Stripe = require('stripe');
const { activatePaidJob, alertOperator } = require('./_pay');

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
    console.error('[stripe-webhook] Signaturpruefung fehlgeschlagen:', err && err.message);
    return res.status(400).send('Webhook Error: ' + (err && err.message));
  }

  if (event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded') {

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[stripe-webhook] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen – Auftrag nicht aktiviert.');
      // 500 -> Stripe wiederholt den Webhook automatisch, sobald die ENV steht.
      return res.status(500).json({ error: 'Supabase ENV fehlt.' });
    }

    let session = event.data.object;
    // Das Event kann aelter als der aktuelle Zustand sein – Session frisch laden,
    // damit payment_status verlaesslich ist.
    try {
      session = await stripe.checkout.sessions.retrieve(session.id);
    } catch (e) {
      console.error('[stripe-webhook] retrieve fehlgeschlagen:', e && e.message);
    }

    try {
      // Kein expectedUserId: der Webhook kommt von Stripe, nicht von einem
      // Browser. Die Bindung an den richtigen Auftrag erfolgt ueber
      // metadata.job_id + jobs.stripe_session_id.
      const r = await activatePaidJob(session, null);
      if (r.ok) {
        console.log('[stripe-webhook]', r.code, session.id, (r.job && r.job.id) || '');
      } else if (r.code === 'not_paid') {
        console.log('[stripe-webhook] noch nicht bezahlt:', session.id, session.payment_status);
      } else if (r.code === 'db_error') {
        // 500 -> Stripe versucht es erneut. Wichtig: der Nutzer hat bezahlt.
        console.error('[stripe-webhook] DB-Fehler, Stripe soll erneut zustellen:', session.id);
        return res.status(500).json({ error: 'DB error' });
      } else {
        // 'mismatch' | 'no_job_ref' | 'forbidden': Geld ist eingezogen, aber
        // kein Auftrag geht live. Das darf nicht still in den Logs verschwinden.
        console.warn('[stripe-webhook] nicht aktiviert:', r.code, session.id, session.metadata || {});
        try { await alertOperator(session, r.code); } catch (e) {}
      }
    } catch (e) {
      console.error('[stripe-webhook] Aktivierung fehlgeschlagen:', e && e.message);
      return res.status(500).json({ error: 'activation failed' });
    }
  }

  return res.status(200).json({ received: true });
};

// Stripe braucht den ROHEN Request-Body fuer die Signaturpruefung.
// Je nach Runtime kann der Body bereits geparst vorliegen (Buffer, String oder
// Objekt) – dann laesst sich der Stream nicht mehr lesen und ein reines
// req.on('data') liefert einen LEEREN Body. Die Signaturpruefung wuerde still
// mit 400 fehlschlagen und der Webhook waere wirkungslos.
// Deshalb: zuerst einen bereits vorhandenen Body verwenden, sonst den Stream.
function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string' && req.body.length) return Promise.resolve(req.body);
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
    // Bereits geparst: nur ein Notnagel. Die exakte Byte-Reihenfolge kann
    // abweichen, dann schlaegt die Signaturpruefung zu Recht fehl.
    console.warn('[stripe-webhook] Body war bereits geparst – bodyParser-Konfiguration pruefen.');
    return Promise.resolve(JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
