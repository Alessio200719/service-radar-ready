// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/create-checkout-session   { job_id }   + Authorization: Bearer <token>
// ------------------------------------------------------------
// Erstellt eine Stripe Checkout Session (gehostete Bezahlseite) fuer GENAU EINEN
// bereits als status='pending' gespeicherten Auftrag.
//
// PREIS UND PRODUKT WERDEN HIER SERVERSEITIG FIXIERT (2,00 EUR) – der Client kann
// den Betrag NICHT manipulieren. Es wird ausschliesslich der GEHEIME
// Stripe-Key aus der Vercel-Umgebungsvariable STRIPE_SECRET_KEY genutzt.
// (Niemals den Secret Key ins Frontend legen.)
//
// Sicherheit:
//   - Aufrufer muss angemeldet sein (Supabase Access-Token wird geprueft)
//   - der Auftrag muss dem Aufrufer gehoeren und status='pending' haben
//   - Session, Nutzer und Auftrag werden fest miteinander verknuepft:
//       Stripe:    metadata.job_id / metadata.user_id / client_reference_id
//       Datenbank: jobs.stripe_session_id (UNIQUE)
//     Damit kann eine bezahlte Session nie einen anderen Auftrag veroeffentlichen.
// ============================================================
const Stripe = require('stripe');
const { verifyUser, sbRest, activatePaidJob, resolveOrigin } = require('./_pay');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY ist nicht gesetzt (Vercel → Settings → Environment Variables).' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (Vercel ENV).' });
  }

  // ── 1) Aufrufer authentifizieren ────────────────────────────
  const caller = await verifyUser(req);
  if (!caller) return res.status(401).json({ error: 'Nicht angemeldet.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  body = body || {};
  const jobId = (body.job_id || '').toString().trim();
  if (!jobId) return res.status(400).json({ error: 'job_id erforderlich.' });

  const stripe = Stripe(secret);

  try {
    // ── 2) Auftrag laden, Eigentum und Status pruefen ─────────
    const found = await sbRest(
      'jobs?id=eq.' + encodeURIComponent(jobId) +
      '&select=id,user_id,title,status,stripe_session_id',
      { method: 'GET' }
    );
    const job = found.ok && Array.isArray(found.data) ? found.data[0] : null;

    if (!job) return res.status(404).json({ error: 'Auftrag nicht gefunden.' });
    if (String(job.user_id) !== String(caller.id)) {
      return res.status(403).json({ error: 'Kein Zugriff auf diesen Auftrag.' });
    }
    if (job.status === 'active') {
      // Bereits bezahlt und live – kein zweiter Checkout.
      return res.status(409).json({ error: 'Dieser Auftrag ist bereits veroeffentlicht.', already_active: true });
    }
    if (job.status !== 'pending') {
      return res.status(409).json({ error: 'Dieser Auftrag kann nicht bezahlt werden.' });
    }

    // ── 2b) Gesperrte Nutzer duerfen nicht veroeffentlichen ───
    // Die RLS-Policy "jobs_insert_own" prueft den Ban beim Anlegen des
    // Entwurfs. Da die Aktivierung serverseitig ueber service_role laeuft
    // (umgeht RLS), wird der Ban hier erneut geprueft – sonst koennte ein
    // nachtraeglich gesperrter Nutzer seinen Entwurf noch live schalten.
    const bans = await sbRest(
      'user_bans?user_id=eq.' + encodeURIComponent(caller.id) + '&select=until',
      { method: 'GET' }
    );
    if (bans.ok && Array.isArray(bans.data)) {
      const active = bans.data.some(b => !b.until || new Date(b.until) > new Date());
      if (active) return res.status(403).json({ error: 'Dein Konto ist gesperrt.' });
    }

    // ── 2c) Bereits vorhandene Checkout-Session wiederverwenden ──
    // Sonst entsteht bei einem zweiten Klick (Browser-Zurueck, zweiter Tab)
    // eine neue Session und die alte wird verwaist: der Nutzer koennte die
    // alte Session noch bezahlen, waehrend der Auftrag bereits die neue
    // Session-ID traegt -> bezahlt, aber nie veroeffentlicht.
    if (job.stripe_session_id) {
      let old = null;
      try { old = await stripe.checkout.sessions.retrieve(job.stripe_session_id); } catch (e) { old = null; }
      if (old && old.payment_status === 'paid') {
        // Zwischenzeitlich bezahlt (z. B. Webhook noch unterwegs) – sofort
        // aktivieren statt ein zweites Mal kassieren.
        const done = await activatePaidJob(old, caller.id);
        return res.status(done.ok ? 200 : (done.status || 409)).json({
          already_paid: true, published: !!done.ok, code: done.code, job_id: job.id
        });
      }
      if (old && old.status === 'open' && old.url) {
        // Noch gueltige, unbezahlte Session – dieselbe Bezahlseite erneut nutzen.
        return res.status(200).json({ url: old.url, id: old.id, job_id: job.id, reused: true });
      }
      // Abgelaufen oder storniert -> unten wird eine neue Session erzeugt.
      // (Ein 'open'-Zustand ist hier bereits abgefangen, es bleibt nichts zu schliessen.)
    }

    // ── 3) Basis-URL fuer Rueck-Weiterleitungen ───────────────
    // Fail closed: kein Fallback auf den (faelschbaren) Request-Host.
    const originRes = resolveOrigin();
    if (originRes.error) {
      console.error('[create-checkout-session] SITE_URL:', originRes.error);
      return res.status(500).json({ error: originRes.error });
    }
    const origin = originRes.origin;

    // ── 4) Stripe-Session erstellen, fest an Nutzer + Auftrag gebunden ──
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
      ...(caller.email ? { customer_email: caller.email } : {}),
      client_reference_id: String(job.id),
      success_url: origin + '/?sr_pay=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  origin + '/?sr_pay=cancel',
      metadata: {
        kind: 'inseratsgebuehr',
        job_id: String(job.id),
        user_id: String(caller.id),
        job_title: (job.title || '').toString().slice(0, 250)
      }
    });

    // ── 5) Session am Auftrag vermerken (COMPARE-AND-SET) ─────
    // Der Filter enthaelt den ERWARTETEN Vorzustand der Spalte. Zwei parallele
    // Tabs koennen den Auftrag sonst beide als "keine Session" lesen, beide
    // eine Stripe-Session erzeugen und die zweite die erste ueberschreiben –
    // die erste bliebe bezahlbar, wuerde aber nie einen Auftrag freischalten.
    // Mit dem Vorzustand im Filter gewinnt genau ein Aufruf; der Verlierer
    // verwirft seine Session sofort.
    // UNIQUE-Index auf jobs.stripe_session_id -> eine Session gehoert dauerhaft
    // zu genau einem Auftrag. status=eq.pending verhindert, dass ein bereits
    // aktiver Auftrag nachtraeglich eine neue Session bekommt.
    const prevCond = job.stripe_session_id
      ? '&stripe_session_id=eq.' + encodeURIComponent(job.stripe_session_id)
      : '&stripe_session_id=is.null';
    const upd = await sbRest(
      'jobs?id=eq.' + encodeURIComponent(job.id) + '&status=eq.pending' + prevCond,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ stripe_session_id: session.id })
      }
    );
    if (!upd.ok || !Array.isArray(upd.data) || upd.data.length !== 1) {
      // Auftrag ist zwischenzeitlich nicht mehr pending, ein paralleler Aufruf
      // war schneller, oder die Session-ID ist bereits vergeben. Die gerade
      // erzeugte Session sofort schliessen, damit sie NICHT bezahlt werden
      // kann – sonst entstuende "bezahlt, aber nie veroeffentlicht".
      try { await stripe.checkout.sessions.expire(session.id); } catch (e) {}
      console.error('[create-checkout-session] Zuordnung fehlgeschlagen:', upd.status, upd.raw);
      return res.status(409).json({ error: 'Der Auftrag wird gerade schon bezahlt. Bitte die Seite neu laden.' });
    }

    return res.status(200).json({ url: session.url, id: session.id, job_id: job.id });
  } catch (err) {
    console.error('[create-checkout-session]', err && err.message);
    return res.status(500).json({ error: (err && err.message) || 'Stripe error' });
  }
};
