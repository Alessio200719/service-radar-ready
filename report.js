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
// ── Hilfsfunktionen (bewusst hier eingebettet statt in einer eigenen Datei,
//    damit keine Datei mit Unterstrich noetig ist) ──────────────────────────
const _SB_URL = process.env.SUPABASE_URL || '';
const _SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Prueft das Zugangs-Token des Aufrufers und liefert { id, email } oder null. */
async function verifyUser(req) {
  if (!_SB_URL || !_SB_ANON) return null;
  let token = '';
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (h && /^Bearer\s+/i.test(h)) token = h.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    token = (b && b.access_token) || '';
  }
  if (!token) return null;
  try {
    const r = await fetch(_SB_URL + '/auth/v1/user', {
      headers: { apikey: _SB_ANON, Authorization: 'Bearer ' + token },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: u.email || '' } : null;
  } catch (e) { return null; }
}

/** Body zuverlaessig als Objekt lesen. */
function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b || {};
}

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

  // Selbstmeldung auch serverseitig ausschliessen (das Frontend allein reicht nicht)
  if (type === 'user' && tid === caller.id) {
    return res.status(400).json({ error: 'Selbstmeldung ist nicht möglich.' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let sb = null;
  if (SUPABASE_URL && SERVICE_KEY) {
    sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  }

  // Bei Auftrags-Meldungen pruefen, ob der Auftrag dem Melder selbst gehoert
  if (sb && type === 'job') {
    try {
      const j = await sb.from('jobs').select('user_id').eq('id', tid).maybeSingle();
      if (j.data && j.data.user_id === caller.id) {
        return res.status(400).json({ error: 'Eigene Aufträge können nicht gemeldet werden.' });
      }
    } catch (e) {}
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
    } catch (e) { /* Tabelle evtl. noch nicht angelegt -> Zaehlung ueberspringen */ }

    // 2) Meldung speichern – Fehler hier NICHT verschlucken, sonst meldet die
    //    Seite Erfolg, obwohl nichts in der Datenbank gelandet ist.
    try {
      const ins = await sb.from('reports').insert({
        reporter_id: caller.id, target_type: type, target_id: tid,
        target_label: label, reason: reason, detail: detail,
      });
      if (ins.error) {
        console.error('[SR] report insert', ins.error);
        return res.status(500).json({ error: 'Speichern fehlgeschlagen: ' + (ins.error.message || 'unbekannt') });
      }
    } catch (e) {
      console.error('[SR] report insert', e && e.message);
      return res.status(500).json({ error: 'Speichern fehlgeschlagen.' });
    }

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

  // 4) Betreiber per E-Mail informieren – mit vollem Kontext zur Prüfung
  if (!RESEND_API_KEY) {
    console.warn('[SR] Meldung gespeichert, aber RESEND_API_KEY fehlt.');
    return res.status(200).json({ ok: true, mailed: false });
  }

  // Kontext nachladen: Auftragsdaten bzw. gemeldeter Nutzer + bisherige Meldungen
  let ctx = '';
  let totalForTarget = 1;
  if (sb) {
    try {
      const c = await sb.from('reports').select('id', { count: 'exact', head: true })
        .eq('target_type', type).eq('target_id', tid);
      if (typeof c.count === 'number') totalForTarget = c.count;
    } catch (e) {}
    try {
      if (type === 'job') {
        const j = await sb.from('jobs').select('title,description,price,city,status,user_id').eq('id', tid).maybeSingle();
        const job = j.data;
        if (job) {
          let owner = null;
          try {
            const o = await sb.from('profiles').select('full_name,email,rating,review_count').eq('id', job.user_id).maybeSingle();
            owner = o.data;
          } catch (e) {}
          ctx =
            '<h3 style="font:600 15px system-ui;margin:18px 0 8px">Gemeldeter Auftrag</h3>' +
            '<table style="font:14px system-ui;border-collapse:collapse">' +
            '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Titel</td><td><b>' + esc(job.title) + '</b></td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Preis / Ort</td><td>' + esc(job.price) + ' € · ' + esc(job.city || '–') + '</td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Status</td><td>' + esc(job.status) + '</td></tr>' +
            (owner ? '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Ersteller</td><td>' + esc(owner.full_name) + ' (' + esc(owner.email) + ') · ★ ' + esc(owner.rating || 0) + ' aus ' + esc(owner.review_count || 0) + '</td></tr>' : '') +
            '</table>' +
            (job.description ? '<p style="font:13px/1.6 system-ui;color:#3d444d;background:#f6f8fa;border:1px solid #d0d7de;border-radius:8px;padding:10px 12px;margin-top:10px;white-space:pre-wrap">' + esc(String(job.description).slice(0, 800)) + '</p>' : '');
        }
      } else if (type === 'user') {
        const u = await sb.from('profiles').select('full_name,email,city,bio,rating,review_count').eq('id', tid).maybeSingle();
        const prof = u.data;
        if (prof) {
          ctx =
            '<h3 style="font:600 15px system-ui;margin:18px 0 8px">Gemeldeter Nutzer</h3>' +
            '<table style="font:14px system-ui;border-collapse:collapse">' +
            '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Name</td><td><b>' + esc(prof.full_name) + '</b></td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#57606a">E-Mail</td><td>' + esc(prof.email) + '</td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Ort</td><td>' + esc(prof.city || '–') + '</td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Bewertung</td><td>★ ' + esc(prof.rating || 0) + ' aus ' + esc(prof.review_count || 0) + '</td></tr>' +
            '</table>' +
            (prof.bio ? '<p style="font:13px/1.6 system-ui;color:#3d444d;background:#f6f8fa;border:1px solid #d0d7de;border-radius:8px;padding:10px 12px;margin-top:10px;white-space:pre-wrap">' + esc(String(prof.bio).slice(0, 500)) + '</p>' : '');
        }
      }
    } catch (e) { console.error('[SR] report context', e && e.message); }
  }

  const site = (process.env.SITE_URL && process.env.SITE_URL.replace(/\/+$/, '')) || 'https://service-radar.com';
  const warnBox = totalForTarget >= 3
    ? '<p style="font:600 14px system-ui;background:#fff1e5;border:1px solid #ffb77c;border-radius:8px;padding:10px 12px;margin:14px 0">Achtung: Das ist bereits die ' + totalForTarget + '. Meldung zu diesem Eintrag.</p>'
    : '';

  const html =
    '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:620px;color:#0d1117">' +
    '<h2 style="font:600 18px system-ui;margin:0 0 12px">Neue Meldung auf Service Radar</h2>' +
    warnBox +
    '<table style="font:14px system-ui;border-collapse:collapse">' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Typ</td><td><b>' + (type === 'job' ? 'Auftrag' : 'Nutzer') + '</b></td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Betrifft</td><td>' + esc(label || tid) + '</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Grund</td><td><b>' + esc(reason) + '</b></td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Melder</td><td>' + esc(caller.email || caller.id) + '</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Meldungen gesamt</td><td>' + totalForTarget + '</td></tr>' +
    '</table>' +
    (detail ? '<p style="font:14px/1.6 system-ui;margin-top:14px;white-space:pre-wrap"><b>Begründung:</b><br>' + esc(detail) + '</p>' : '') +
    ctx +
    '<p style="margin:22px 0 0"><a href="' + site + '/#moderation" style="display:inline-block;background:#0d1117;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font:600 14px system-ui">In der Moderation öffnen</a></p>' +
    '<p style="font:12px system-ui;color:#8b949e;margin-top:14px">Dort kannst du verwarnen, sperren, den Auftrag ausblenden oder die Meldung als erledigt markieren.</p>' +
    '</div>';

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
