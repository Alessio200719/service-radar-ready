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
'use strict';
const { createClient } = require('@supabase/supabase-js');

const SITE = (process.env.SITE_URL || 'https://service-radar.com').replace(/\/$/, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function htmlPage(title, msg, ok) {
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

module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // ── Weg 1: Link aus der E-Mail ────────────────────────────
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const tok = req.query && req.query.token ? String(req.query.token) : '';
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).send(htmlPage('Fehler', 'Der Server ist nicht korrekt konfiguriert.', false));
    if (!tok) return res.status(400).send(htmlPage('Ungültiger Link', 'Dieser Abmeldelink ist ungültig.', false));
    try {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const r = await unsubscribe(sb, 'token', tok);
      if (!r.found) return res.status(404).send(htmlPage('Link ungültig', 'Zu diesem Link wurde keine Anmeldung gefunden.', false));
      return res.status(200).send(htmlPage('Abgemeldet',
        'Du erhältst ab sofort keinen Newsletter mehr von Service Radar. Falls du es dir anders überlegst, kannst du dich jederzeit erneut anmelden.', true));
    } catch (e) {
      console.error('Newsletter unsubscribe error:', e);
      return res.status(500).send(htmlPage('Fehler', 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.', false));
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
};
