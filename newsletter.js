// ============================================================
// Service Radar – Newsletter (alle drei Schritte in EINER Funktion)
//
//   /api/newsletter-subscribe    -> action=subscribe   (POST)
//   /api/newsletter-confirm      -> action=confirm     (GET)
//   /api/newsletter-unsubscribe  -> action=unsubscribe (GET mit token, POST mit email)
//
// Die alten Adressen bleiben gültig – vercel.json leitet sie hierher um.
// Grund für die Zusammenlegung: Der kostenlose Vercel-Tarif erlaubt höchstens
// 12 Serverless Functions pro Deployment.
// ============================================================
'use strict';
const { createClient } = require('@supabase/supabase-js');

const SITE = (process.env.SITE_URL || 'https://service-radar.com').replace(/\/$/, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// ============================================================
// Service Radar – POST /api/newsletter-subscribe
// Double-Opt-in: speichert E-Mail (unbestätigt) + Token und schickt
// eine Bestätigungs-Mail. Bestätigung erst über /api/newsletter-confirm.
// Server-only (SUPABASE_SERVICE_ROLE_KEY). E-Mail via Resend (optional).
// ============================================================


function token() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 40);
}

async function sendConfirmation(email, confirmUrl, unsubUrl) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM || 'Service Radar <newsletter@service-radar.com>';
  if (!key) return { sent: false, reason: 'no_provider' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from, to: [email], subject: 'Bitte bestätige deinen Service-Radar-Newsletter',
        html: '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">'
          + '<h2 style="color:#0f1117">Fast geschafft</h2>'
          + '<p style="color:#586069;line-height:1.6">Bitte bestätige deine Anmeldung zum Service-Radar-Newsletter mit einem Klick:</p>'
          + '<p><a href="' + confirmUrl + '" style="display:inline-block;background:#0f1117;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Anmeldung bestätigen</a></p>'
          + '<p style="color:#8b949e;font-size:12px">Wenn du das nicht warst, ignoriere diese E-Mail einfach.</p>'
          + '<p style="color:#8b949e;font-size:12px;border-top:1px solid #d0d7de;padding-top:12px;margin-top:18px">'
          + 'Du willst doch keine E-Mails? <a href="' + unsubUrl + '" style="color:#586069">Hier abmelden</a>.</p></div>'
      })
    });
    return { sent: r.ok };
  } catch (e) { return { sent: false, reason: 'send_error' }; }
}
// ============================================================
// Service Radar – GET /api/newsletter-confirm?token=...
// Double-Opt-in-Bestätigung: setzt confirmed=true und zeigt eine
// kleine Bestätigungsseite. Server-only (SUPABASE_SERVICE_ROLE_KEY).
// ============================================================


function htmlPage(title, msg, ok, extra) {
  return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>' + title + ' | Service Radar</title>'
    + '<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f6f8fa;color:#0f1117;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px}'
    + '.c{background:#fff;border:1px solid #d0d7de;border-radius:16px;padding:32px;max-width:440px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)}'
    + 'h1{font-size:21px;margin:10px 0 8px}p{color:#586069;line-height:1.6;margin:0 0 18px}'
    + 'a{display:inline-block;background:#0f1117;color:#fff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:700}</style></head>'
    + '<body><div class="c"><h1>' + title + '</h1><p>' + msg + '</p>'
    + '<a href="' + SITE + '/">Zur Startseite</a>'
    + (extra || '') + '</div></body></html>';
}
// ============================================================
// Service Radar – Newsletter abmelden
//
// GET  /api/newsletter-unsubscribe?token=...   -> meldet sofort ab (Link aus Mails)
// POST /api/newsletter-unsubscribe { email }   -> meldet per Adresse ab (Formular)
//
// Die Adresse bleibt in der Tabelle stehen, wird aber mit unsubscribed_at
// markiert. So lässt sich nachweisen, dass die Abmeldung erfolgt ist, und eine
// erneute Anmeldung ist jederzeit möglich.
// ============================================================


function htmlPageOff(title, msg, ok) {
  return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>' + title + ' | Service Radar</title>'
    + '<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f6f8fa;color:#0f1117;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px}'
    + '.c{background:#fff;border:1px solid #d0d7de;border-radius:16px;padding:32px;max-width:440px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)}'
    + 'h1{font-size:21px;margin:0 0 10px}p{color:#586069;line-height:1.6;margin:0 0 18px}'
    + 'a{display:inline-block;background:#0f1117;color:#fff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:600}</style></head>'
    + '<body><div class="c"><h1>' + title + '</h1><p>' + msg + '</p>'
    + '<a href="' + SITE + '/">Zur Startseite</a></div></body></html>';
}

async function unsubscribe(sb, where, value) {
  const found = await sb.from('newsletter_subscribers')
    .select('id,unsubscribed_at').eq(where, value).maybeSingle();
  if (!found.data) return { found: false };
  if (!found.data.unsubscribed_at) {
    await sb.from('newsletter_subscribers')
      .update({ unsubscribed_at: new Date().toISOString(), confirmed: false })
      .eq('id', found.data.id);
  }
  return { found: true, already: !!found.data.unsubscribed_at };
}

async function doSubscribe(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed' }); }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Server nicht konfiguriert (SUPABASE_URL / SERVICE_ROLE_KEY).' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) { body = {}; }
  const email = String(body.email || '').trim().toLowerCase();
  const source = String(body.source || 'web').slice(0, 40);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const existing = await sb.from('newsletter_subscribers').select('id,confirmed,token').eq('email', email).maybeSingle();
    if (existing.data && existing.data.confirmed) return res.status(200).json({ ok: true, already: true });

    let tok = (existing.data && existing.data.token) || token();
    if (existing.data) {
      await sb.from('newsletter_subscribers').update({ token: tok, source }).eq('email', email);
    } else {
      const ins = await sb.from('newsletter_subscribers').insert({ email, token: tok, source, confirmed: false });
      if (ins.error) { console.error('Newsletter insert error:', ins.error); return res.status(500).json({ ok: false, error: ins.error.message }); }
    }
    const confirmUrl = SITE + '/api/newsletter-confirm?token=' + encodeURIComponent(tok);
    const unsubUrl   = SITE + '/api/newsletter-unsubscribe?token=' + encodeURIComponent(tok);
    const mail = await sendConfirmation(email, confirmUrl, unsubUrl);
    return res.status(200).json({ ok: true, emailed: mail.sent });
  } catch (e) {
    console.error('Newsletter subscribe error:', e);
    return res.status(500).json({ ok: false, error: (e && e.message) || 'error' });
  }
}

async function doConfirm(req, res) {
  const tok = req.query && req.query.token ? String(req.query.token) : '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).send(htmlPage('Fehler', 'Der Server ist nicht korrekt konfiguriert.', false));
  if (!tok) return res.status(400).send(htmlPage('Ungültiger Link', 'Dieser Bestätigungslink ist ungültig.', false));

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const found = await sb.from('newsletter_subscribers').select('id,confirmed').eq('token', tok).maybeSingle();
    if (!found.data) return res.status(404).send(htmlPage('Link ungültig', 'Dieser Bestätigungslink ist nicht mehr gültig.', false));
    if (!found.data.confirmed) {
      await sb.from('newsletter_subscribers').update({ confirmed: true, confirmed_at: new Date().toISOString() }).eq('id', found.data.id);
    }
    return res.status(200).send(htmlPage('Anmeldung bestätigt',
      'Danke! Deine Newsletter-Anmeldung ist jetzt aktiv.', true,
      '<p style="font-size:12.5px;color:#8b949e;margin-top:18px">Du kannst dich jederzeit wieder abmelden: '
      + '<a href="' + SITE + '/api/newsletter-unsubscribe?token=' + encodeURIComponent(tok) + '" style="background:none;color:#586069;padding:0;text-decoration:underline;font-weight:400">Newsletter abbestellen</a></p>'));
  } catch (e) {
    console.error('Newsletter confirm error:', e);
    return res.status(500).send(htmlPage('Fehler', 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.', false));
  }
}

async function doUnsubscribe(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // ── Weg 1: Link aus der E-Mail ────────────────────────────
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const tok = req.query && req.query.token ? String(req.query.token) : '';
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).send(htmlPageOff('Fehler', 'Der Server ist nicht korrekt konfiguriert.', false));
    if (!tok) return res.status(400).send(htmlPageOff('Ungültiger Link', 'Dieser Abmeldelink ist ungültig.', false));
    try {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const r = await unsubscribe(sb, 'token', tok);
      if (!r.found) return res.status(404).send(htmlPageOff('Link ungültig', 'Zu diesem Link wurde keine Anmeldung gefunden.', false));
      return res.status(200).send(htmlPageOff('Abgemeldet',
        'Du erhältst ab sofort keinen Newsletter mehr von Service Radar. Falls du es dir anders überlegst, kannst du dich jederzeit erneut anmelden.', true));
    } catch (e) {
      console.error('Newsletter unsubscribe error:', e);
      return res.status(500).send(htmlPageOff('Fehler', 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.', false));
    }
  }

  // ── Weg 2: Formular auf der Website ───────────────────────
  if (req.method === 'POST') {
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Server nicht konfiguriert.' });
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) { body = {}; }
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
    try {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      await unsubscribe(sb, 'email', email);
      // Bewusst immer dieselbe Antwort: sonst liesse sich pruefen, welche
      // Adressen angemeldet sind.
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('Newsletter unsubscribe error:', e);
      return res.status(500).json({ ok: false, error: (e && e.message) || 'error' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

module.exports = async function handler(req, res) {
  const action = String((req.query && req.query.action) || '').toLowerCase();
  if (action === 'confirm')     return doConfirm(req, res);
  if (action === 'unsubscribe') return doUnsubscribe(req, res);
  if (action === 'subscribe')   return doSubscribe(req, res);
  // Ohne action: aus der Methode ableiten
  if (req.method === 'POST') return doSubscribe(req, res);
  return res.status(400).json({ ok: false, error: 'Unbekannte Aktion.' });
};
