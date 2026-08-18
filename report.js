// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/report   { type, targetId, targetLabel, reason, detail, reporterEmail }
// Schickt eine eingegangene Meldung per E-Mail an den Betreiber.
// Ohne RESEND_API_KEY wird die Meldung nur protokolliert (kein Absturz).
// ============================================================
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.NEWSLETTER_FROM || 'Service Radar <noreply@service-radar.com>';
const TO   = process.env.REPORT_TO || 'info@service-radar.com';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  const type   = String(b.type || '').slice(0, 40);
  const target = String(b.targetLabel || b.targetId || '').slice(0, 200);
  const reason = String(b.reason || '').slice(0, 120);
  const detail = String(b.detail || '').slice(0, 1000);
  const from   = String(b.reporterEmail || 'unbekannt').slice(0, 200);
  if (!reason) return res.status(400).json({ error: 'reason fehlt.' });

  if (!RESEND_API_KEY) {
    console.warn('[SR] Meldung eingegangen, aber RESEND_API_KEY fehlt:', { type, target, reason });
    return res.status(200).json({ ok: true, mailed: false });
  }

  const html =
    '<h2 style="font:600 18px system-ui;margin:0 0 12px">Neue Meldung auf Service Radar</h2>' +
    '<table style="font:14px system-ui;border-collapse:collapse">' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Typ</td><td><b>' + esc(type) + '</b></td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Betrifft</td><td>' + esc(target) + '</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Grund</td><td><b>' + esc(reason) + '</b></td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#57606a">Melder</td><td>' + esc(from) + '</td></tr>' +
    '</table>' +
    (detail ? '<p style="font:14px/1.6 system-ui;margin-top:14px;white-space:pre-wrap">' + esc(detail) + '</p>' : '');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: [TO],
        subject: 'Meldung: ' + (reason || 'unbekannt') + ' – ' + (target || type),
        html,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('[SR] report mail failed', t.slice(0, 300));
      return res.status(200).json({ ok: true, mailed: false });
    }
  } catch (e) {
    console.error('[SR] report mail error', e);
    return res.status(200).json({ ok: true, mailed: false });
  }
  return res.status(200).json({ ok: true, mailed: true });
};
