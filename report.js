// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/report
// Nimmt eine Meldung entgegen, speichert sie in der Datenbank (Tabelle
// public.reports) und benachrichtigt den Betreiber per E-Mail.
//
// SICHERHEIT:
//  1. Nur angemeldete Nutzer dürfen melden (Token wird geprüft).
//  2. Höchstens 5 Meldungen pro Nutzer und Stunde – sonst liesse sich das
//     E-Mail-Kontingent mit einem Skript in Sekunden aufbrauchen.
//  3. Ab 3 Meldungen gegen denselben Auftrag wird dieser automatisch
//     serverseitig auf 'flagged' gesetzt (nicht mehr nur im Browser).
// ============================================================
const { createClient } = require('@supabase/supabase-js');
const { verifyUser, readBody } = require('./_auth');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.NEWSLETTER_FROM || 'Service Radar <noreply@service-radar.com>';
const TO   = process.env.REPORT_TO || 'info@service-radar.com';
const REPORTS_PER_HOUR = 5;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const caller = await verifyUser(req);
  if (!caller) return res.status(401).json({ error: 'Nicht angemeldet.' });

  const b = readBody(req);
  const type   = String(b.type || '').slice(0, 20);
  const tid    = String(b.targetId || '').slice(0, 100);
  const label  = String(b.targetLabel || '').slice(0, 200);
  const reason = String(b.reason || '').slice(0, 120);
  const detail = String(b.detail || '').slice(0, 1000);
  if (!reason) return res.status(400).json({ error: 'reason fehlt.' });
  if (type !== 'job' && type !== 'user') return res.status(400).json({ error: 'Ungültiger Typ.' });

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let sb = null;
  if (SUPABASE_URL && SERVICE_KEY) {
    sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  }

  // 1) Bremse: wie viele Meldungen hat dieser Nutzer in der letzten Stunde abgesetzt?
  if (sb) {
    try {
      const since = new Date(Date.now() - 3600e3).toISOString();
      const cnt = await sb.from('reports').select('id', { count: 'exact', head: true })
        .eq('reporter_id', caller.id).gte('created_at', since);
      if (typeof cnt.count === 'number' && cnt.count >= REPORTS_PER_HOUR) {
        return res.status(429).json({ error: 'Zu viele Meldungen. Bitte warte eine Stunde.' });
      }
    } catch (e) { /* Tabelle evtl. noch nicht angelegt -> nicht blockieren */ }

    // 2) Meldung speichern
    try {
      await sb.from('reports').insert({
        reporter_id: caller.id, target_type: type, target_id: tid,
        target_label: label, reason: reason, detail: detail,
      });
    } catch (e) { console.error('[SR] report insert', e && e.message); }

    // 3) Ab 3 Meldungen: Auftrag serverseitig markieren
    if (type === 'job' && tid) {
      try {
        const c = await sb.from('reports').select('id', { count: 'exact', head: true })
          .eq('target_type', 'job').eq('target_id', tid);
        if (typeof c.count === 'number' && c.count >= 3) {
          await sb.from('jobs').update({ status: 'flagged' }).eq('id', tid);
        }
      } catch (e) { console.error('[SR] auto-flag', e && e.message); }
    }
  }

  // 4) Betreiber per E-Mail informieren
  if (!RESEND_API_KEY) {
    console.warn('[SR] Meldung gespeichert, aber RESEND_API_KEY fehlt.');
    return res.status(200).json({ ok: true, mailed: false });
  }
  const html =
    '<h2 style="font:600 18px system-ui;margin:0 0 12px">Neue Meldung auf Service Radar</h2>' +
    '<table style="font:14px system-ui;border-collapse:collapse">' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Typ</td><td><b>' + esc(type) + '</b></td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Betrifft</td><td>' + esc(label || tid) + '</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Grund</td><td><b>' + esc(reason) + '</b></td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Melder</td><td>' + esc(caller.email || caller.id) + '</td></tr>' +
    '</table>' +
    (detail ? '<p style="font:14px/1.6 system-ui;margin-top:14px;white-space:pre-wrap">' + esc(detail) + '</p>' : '');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO],
        subject: 'Meldung: ' + reason + ' – ' + (label || tid || type), html }),
    });
    if (!r.ok) { console.error('[SR] report mail failed', (await r.text()).slice(0, 300)); return res.status(200).json({ ok: true, mailed: false }); }
  } catch (e) {
    console.error('[SR] report mail error', e);
    return res.status(200).json({ ok: true, mailed: false });
  }
  return res.status(200).json({ ok: true, mailed: true });
};
