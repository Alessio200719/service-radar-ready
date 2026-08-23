// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/save-push-subscription
// Speichert/aktualisiert die Web-Push-Subscription eines Nutzers in Supabase.
// Nutzt den SUPABASE_SERVICE_ROLE_KEY (nur serverseitig!).
// Body: { user_id, subscription }  (subscription = das PushSubscription-Objekt)
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (Vercel ENV).' });
  }

  try {
    // Der Aufrufer muss angemeldet sein. Die Nutzer-ID kommt AUS DEM TOKEN –
    // sonst koennte jemand eine eigene Push-Adresse unter fremder ID eintragen
    // und dadurch fremde Benachrichtigungen mitlesen.
    const caller = await verifyUser(req);
    if (!caller) return res.status(401).json({ error: 'Nicht angemeldet.' });

    const body = readBody(req);
    const user_id = caller.id;
    const subscription = body.subscription;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'subscription (mit endpoint) erforderlich.' });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const row = { user_id: user_id, endpoint: subscription.endpoint, subscription: subscription };

    // 1) Upsert auf endpoint (nutzt die UNIQUE-Constraint, falls vorhanden)
    let { error } = await sb.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });

    // 2) Robust-Fallback: falls KEINE passende UNIQUE-Constraint auf endpoint existiert,
    //    per delete-by-endpoint + insert speichern (kein Crash bei doppeltem Endpoint).
    if (error && (error.code === '42P10' || /no unique|exclusion constraint|on conflict|matching the on conflict/i.test(error.message || ''))) {
      console.error('Push subscription error (upsert fallback to delete+insert):', error);
      await sb.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      const ins = await sb.from('push_subscriptions').insert(row);
      error = ins.error;
    }

    if (error) { console.error('Push subscription error:', error); return res.status(500).json({ error: error.message }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Push subscription error:', e);
    return res.status(500).json({ error: (e && e.message) || 'error' });
  }
};
