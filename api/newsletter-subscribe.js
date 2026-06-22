// ============================================================
// Service Radar – POST /api/newsletter-subscribe
// Double-Opt-in: speichert E-Mail (unbestätigt) + Token und schickt
// eine Bestätigungs-Mail. Bestätigung erst über /api/newsletter-confirm.
// Server-only (SUPABASE_SERVICE_ROLE_KEY). E-Mail via Resend (optional).
// ============================================================
'use strict';
const { createClient } = require('@supabase/supabase-js');

const SITE = (process.env.SITE_URL || 'https://service-radar.com').replace(/\/$/, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function token() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 40);
}

async function sendConfirmation(email, confirmUrl) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM || 'Service Radar <newsletter@service-radar.com>';
  if (!key) return { sent: false, reason: 'no_provider' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from, to: [email], subject: 'Bitte bestätige deinen Service-Radar-Newsletter',
        html: '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">'m.textContent=d.ok?'🎉 Danke! Du wurdest erfolgreich für zukünftige Updates von Service Radar eingetragen.':(d.error||'Es ist ein Fehler aufgetreten.');
          + '<p><a href="' + confirmUrl + '" style="display:inline-block;background:#0f1117;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">Anmeldung bestätigen</a></p>'
          + '<p style="color:#8b949e;font-size:12px">Wenn du das nicht warst, ignoriere diese E-Mail einfach.</p></div>'
      })
    });
    return { sent: r.ok };
  } catch (e) { return { sent: false, reason: 'send_error' }; }
}

module.exports = async function handler(req, res) {
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
    const mail = await sendConfirmation(email, confirmUrl);
    return res.status(200).json({ ok: true, emailed: mail.sent });
  } catch (e) {
    console.error('Newsletter subscribe error:', e);
    return res.status(500).json({ ok: false, error: (e && e.message) || 'error' });
  }
};
