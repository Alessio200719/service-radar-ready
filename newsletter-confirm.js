// ============================================================
// Service Radar – GET /api/newsletter-confirm?token=...
// Double-Opt-in-Bestätigung: setzt confirmed=true und zeigt eine
// kleine Bestätigungsseite. Server-only (SUPABASE_SERVICE_ROLE_KEY).
// ============================================================
'use strict';
const { createClient } = require('@supabase/supabase-js');

const SITE = (process.env.SITE_URL || 'https://service-radar.com').replace(/\/$/, '');

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

module.exports = async function handler(req, res) {
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
};
