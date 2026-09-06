// ============================================================
// Service Radar – gemeinsame Zahlungs-Logik (KEINE eigene Vercel Function)
// ------------------------------------------------------------
// Der fuehrende Unterstrich sorgt dafuer, dass Vercel diese Datei NICHT als
// Route zaehlt (wie api/_ssr.js). Das Function-Limit von 12 bleibt bei 11.
//
// Hier liegt die sicherheitskritische Aktivierungs-Logik an EINER Stelle,
// damit /api/verify-checkout-session und /api/stripe-webhook sich nicht
// auseinander entwickeln koennen.
// ============================================================

const SB_URL     = process.env.SUPABASE_URL || '';
const SB_ANON    = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Prueft das Supabase-Zugangs-Token des Aufrufers. Liefert { id, email } oder null. */
async function verifyUser(req) {
  if (!SB_URL || !SB_ANON) return null;
  let token = '';
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (h && /^Bearer\s+/i.test(h)) token = h.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(SB_URL + '/auth/v1/user', {
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: u.email || '' } : null;
  } catch (e) { return null; }
}

/** Supabase REST mit service_role (umgeht RLS – ausschliesslich serverseitig!). */
async function sbRest(path, init) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, Object.assign({}, init, {
    headers: Object.assign({
      apikey: SB_SERVICE,
      Authorization: 'Bearer ' + SB_SERVICE,
      'Content-Type': 'application/json',
    }, (init && init.headers) || {}),
  }));
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  return { ok: r.ok, status: r.status, data, raw: text };
}

/**
 * Schaltet den zu einer bezahlten Stripe-Session gehoerenden Auftrag live.
 *
 * Das eigentliche UPDATE ist ATOMAR: PostgREST erzeugt ein einziges
 *   UPDATE jobs SET status='active', paid_at=now()
 *   WHERE id = <job_id> AND stripe_session_id = <session.id> AND status = 'pending'
 * Zwei parallele Aufrufe koennen deshalb niemals beide eine Zeile treffen –
 * genau eine Zahlung autorisiert genau eine Veroeffentlichung.
 *
 * @param {object} session  Stripe Checkout Session (bereits von Stripe geladen)
 * @param {string} expectedUserId  optional: erwarteter Eigentuemer (Client-Aufruf)
 * @returns {Promise<{ok:boolean, code:string, status?:number, job?:object}>}
 *   code: 'published' | 'already_published' | 'not_paid' | 'no_job_ref'
 *       | 'forbidden' | 'mismatch' | 'db_error'
 */
async function activatePaidJob(session, expectedUserId) {
  if (!session || typeof session !== 'object') {
    return { ok: false, code: 'no_job_ref', status: 400 };
  }
  if (session.payment_status !== 'paid') {
    return { ok: false, code: 'not_paid', status: 402 };
  }

  const meta   = session.metadata || {};
  const jobId  = (meta.job_id || session.client_reference_id || '').toString().trim();
  const ownerId = (meta.user_id || '').toString().trim();

  // Sessions aus der Zeit vor dieser Absicherung tragen keine job_id. Sie
  // werden NIEMALS automatisch irgendeinem Auftrag zugeordnet – der Betreiber
  // ordnet sie manuell zu (siehe alertOperator).
  if (!jobId) return { ok: false, code: 'no_job_ref', status: 409 };

  // Die Session muss zum aufrufenden Nutzer gehoeren. Eine fremde oder
  // geteilte session_id autorisiert damit nichts.
  // Fail closed: fehlt metadata.user_id (Legacy-Session), gilt die Zuordnung
  // als NICHT bewiesen – nicht als "keine Einschraenkung".
  if (expectedUserId && String(ownerId || '') !== String(expectedUserId)) {
    return { ok: false, code: ownerId ? 'forbidden' : 'no_job_ref', status: ownerId ? 403 : 409 };
  }

  // ── Atomar konsumieren ──────────────────────────────────────
  const filter = 'jobs?id=eq.' + encodeURIComponent(jobId) +
                 '&stripe_session_id=eq.' + encodeURIComponent(session.id) +
                 '&status=eq.pending';
  const upd = await sbRest(filter, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'active', paid_at: new Date().toISOString() }),
  });

  if (upd.ok && Array.isArray(upd.data) && upd.data.length === 1) {
    return { ok: true, code: 'published', status: 200, job: upd.data[0] };
  }
  if (!upd.ok) {
    console.error('[_pay] Aktivierung fehlgeschlagen:', upd.status, upd.raw);
    return { ok: false, code: 'db_error', status: 500 };
  }

  // ── Nachzuegler-Fall ────────────────────────────────────────
  // Bricht create-checkout-session zwischen "Stripe-Session erzeugt" und
  // "Session am Auftrag vermerkt" ab, existiert eine bezahlbare Session,
  // waehrend jobs.stripe_session_id noch NULL ist. Ohne diesen Zweig waere
  // das dauerhaft "bezahlt, aber nie veroeffentlicht".
  //
  // Sicher, weil ALLES aus der Stripe-Session selbst kommt: metadata wird
  // ausschliesslich serverseitig gesetzt und von Stripe unveraendert
  // zurueckgegeben – ein Client kann sie nicht faelschen. Zusaetzlich muss
  // der Auftrag dem in der metadata genannten Nutzer gehoeren, noch pending
  // sein UND noch gar keine Session tragen. Der UNIQUE-Index auf
  // stripe_session_id bleibt die Garantie "eine Session = ein Auftrag".
  if (jobId && ownerId) {
    const claim = await sbRest(
      'jobs?id=eq.' + encodeURIComponent(jobId) +
      '&user_id=eq.' + encodeURIComponent(ownerId) +
      '&status=eq.pending&stripe_session_id=is.null',
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          stripe_session_id: session.id,
          status: 'active',
          paid_at: new Date().toISOString()
        }),
      }
    );
    if (claim.ok && Array.isArray(claim.data) && claim.data.length === 1) {
      console.log('[_pay] Nachzuegler-Zuordnung:', session.id, '->', jobId);
      return { ok: true, code: 'published', status: 200, job: claim.data[0] };
    }
    if (!claim.ok) console.error('[_pay] Nachzuegler-Zuordnung fehlgeschlagen:', claim.status, claim.raw);
  }

  // 0 Zeilen getroffen -> tatsaechlichen Zustand ansehen.
  const cur = await sbRest(
    'jobs?id=eq.' + encodeURIComponent(jobId) +
    '&select=id,user_id,status,stripe_session_id,paid_at',
    { method: 'GET' }
  );
  const job = cur.ok && Array.isArray(cur.data) ? cur.data[0] : null;

  if (!job) return { ok: false, code: 'mismatch', status: 404 };
  if (expectedUserId && String(job.user_id) !== String(expectedUserId)) {
    return { ok: false, code: 'forbidden', status: 403 };
  }
  // Bereits durch einen frueheren Aufruf (Refresh, Doppelklick, Webhook)
  // veroeffentlicht – und zwar durch GENAU DIESE Session. Idempotenter Erfolg.
  if (job.status === 'active' && String(job.stripe_session_id) === String(session.id)) {
    return { ok: true, code: 'already_published', status: 200, job: job };
  }
  // Session gehoert zu einem anderen Auftrag / Auftrag wurde geschlossen o.ae.
  return { ok: false, code: 'mismatch', status: 409 };
}

/**
 * Basis-URL fuer die Stripe success_url / cancel_url.
 *
 * FAIL CLOSED: der Request-Host wird NICHT mehr verwendet. Ein manipulierter
 * Host-Header koennte sonst dazu fuehren, dass Stripe nach der Zahlung auf eine
 * fremde Domain weiterleitet (Open Redirect direkt hinter dem Bezahlvorgang).
 *
 *   SITE_URL gesetzt   -> wird validiert und verwendet
 *   Production ohne    -> harter Fehler, es entsteht KEINE Session
 *   Preview/Dev ohne   -> VERCEL_URL (von Vercel selbst gesetzt, nicht vom Client)
 *
 * @returns {{origin?:string, error?:string}}
 */
function resolveOrigin() {
  const raw = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (raw) {
    if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d{2,5})?$/i.test(raw)) {
      return { error: 'SITE_URL ist ungueltig. Erwartet wird z. B. https://service-radar.com (ohne Pfad, ohne Slash am Ende).' };
    }
    return { origin: raw };
  }
  if (String(process.env.VERCEL_ENV || '') === 'production') {
    return { error: 'SITE_URL ist in Production nicht gesetzt (Vercel → Settings → Environment Variables). Zahlung abgebrochen.' };
  }
  const vu = String(process.env.VERCEL_URL || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (vu && /^[a-z0-9.-]+$/i.test(vu)) return { origin: 'https://' + vu };
  return { error: 'Keine sichere Basis-URL ermittelbar. Bitte SITE_URL setzen.' };
}

/**
 * Betreiber informieren, wenn Geld eingezogen wurde, der Auftrag aber NICHT
 * live gehen konnte. Ohne diese Mail waere so ein Fall nur in den Vercel-Logs
 * sichtbar – der Nutzer haette bezahlt und niemand wuesste davon.
 * Nutzt dieselbe Resend-Mechanik wie api/report.js. Schlaegt nie hart fehl.
 */
async function alertOperator(session, code) {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) { console.warn('[_pay] RESEND_API_KEY fehlt – kein Betreiber-Alarm.'); return; }
  const from = process.env.NEWSLETTER_FROM || 'Service Radar <noreply@service-radar.com>';
  const to   = process.env.REPORT_TO || 'info@service-radar.com';
  const meta = (session && session.metadata) || {};
  const esc  = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = [
    ['Grund',        code],
    ['Session',      session && session.id],
    ['Betrag',       session ? ((session.amount_total || 0) / 100).toFixed(2) + ' ' + String(session.currency || '').toUpperCase() : ''],
    ['Zahlstatus',   session && session.payment_status],
    ['job_id',       meta.job_id || session && session.client_reference_id || '—'],
    ['user_id',      meta.user_id || '—'],
    ['E-Mail',       (session && session.customer_email) || '—'],
  ].map(([k, v]) => '<tr><td style="padding:4px 10px 4px 0"><b>' + esc(k) + '</b></td><td>' + esc(v) + '</td></tr>').join('');
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from, to: [to],
        subject: 'Service Radar: Zahlung ohne Veroeffentlichung (' + code + ')',
        html: '<p>Eine Stripe-Zahlung konnte keinem Auftrag zugeordnet werden. '
            + 'Bitte pruefen und ggf. erstatten oder den Auftrag manuell freischalten.</p>'
            + '<table style="font:14px system-ui,sans-serif">' + rows + '</table>'
      })
    });
  } catch (e) { console.error('[_pay] alertOperator', e && e.message); }
}

module.exports = { verifyUser, sbRest, activatePaidJob, alertOperator, resolveOrigin };
