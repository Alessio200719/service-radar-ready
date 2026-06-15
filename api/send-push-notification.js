// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/send-push-notification
// Sendet eine Web-Push-Benachrichtigung an alle Subscriptions eines Nutzers.
// Nutzt web-push + VAPID + SUPABASE_SERVICE_ROLE_KEY (alles serverseitig!).
// Body: { user_id, title, body, url }
// ============================================================
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY fehlen.' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.' });

  try {
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:info@service-radar.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const user_id = body.user_id;
    if (!user_id) return res.status(400).json({ error: 'user_id erforderlich.' });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: subs, error } = await sb.from('push_subscriptions').select('endpoint, subscription').eq('user_id', user_id);
    if (error) { console.error('Push send error:', error); return res.status(500).json({ error: error.message }); }
    if (!subs || !subs.length) return res.status(200).json({ sent: 0, removed: 0, note: 'no subscriptions' });

    const payload = JSON.stringify({
      title: (body.title || 'Service Radar').toString().slice(0, 120),
      body:  (body.body  || '').toString().slice(0, 240),
      url:   body.url || '/',
      icon:  '/icon-192.png'
    });

    let sent = 0, removed = 0;
    for (const row of subs) {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
      } catch (err) {
        console.error('Push send error:', err && err.statusCode, err && err.body);
        // 404/410 = Subscription abgelaufen/ungültig -> aufräumen
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await sb.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
          removed++;
        }
      }
    }
    return res.status(200).json({ sent: sent, removed: removed });
  } catch (e) {
    console.error('Push send error:', e);
    return res.status(500).json({ error: (e && e.message) || 'error' });
  }
};
