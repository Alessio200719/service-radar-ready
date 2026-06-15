// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/save-push-subscription
// Speichert/aktualisiert die Web-Push-Subscription eines Nutzers in Supabase.
// Nutzt den SUPABASE_SERVICE_ROLE_KEY (nur serverseitig!).
// Body: { user_id, subscription }  (subscription = das PushSubscription-Objekt)
// ============================================================
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (Vercel ENV).' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const user_id = body.user_id;
    const subscription = body.subscription;
    if (!user_id || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'user_id und subscription (mit endpoint) erforderlich.' });
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
