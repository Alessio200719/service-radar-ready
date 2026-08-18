// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/delete-account   { access_token }
// Löscht das Konto des ANGEMELDETEN Nutzers vollständig (DSGVO Art. 17):
// eigene Aufträge, Bewerbungen, Nachrichten, Bewertungen, Profil und das
// Auth-Konto selbst. Erfordert SUPABASE_SERVICE_ROLE_KEY (nur serverseitig).
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function sb(path, init) {
  const r = await fetch(SUPABASE_URL + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(init && init.headers ? init.headers : {}),
    },
  });
  return r;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const token = (body && body.access_token) || '';
  if (!token) return res.status(400).json({ error: 'access_token fehlt.' });

  // 1) Token prüfen -> Nutzer-ID ermitteln (niemand darf fremde Konten löschen)
  let userId = '';
  try {
    const me = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + token },
    });
    if (!me.ok) return res.status(401).json({ error: 'Nicht angemeldet.' });
    const u = await me.json();
    userId = u && u.id;
  } catch (e) {
    return res.status(401).json({ error: 'Nicht angemeldet.' });
  }
  if (!userId) return res.status(401).json({ error: 'Nicht angemeldet.' });

  // 2) Zugehörige Daten entfernen (Reihenfolge: abhängige Tabellen zuerst)
  const del = async (table, query) => {
    try { await sb('/rest/v1/' + table + '?' + query, { method: 'DELETE' }); } catch (e) {}
  };
  await del('messages',     'sender_id=eq.' + userId);
  await del('messages',     'receiver_id=eq.' + userId);
  await del('applications', 'helper_id=eq.' + userId);
  await del('reviews',      'reviewer_id=eq.' + userId);
  await del('reviews',      'reviewed_user_id=eq.' + userId);
  await del('saved_jobs',   'user_id=eq.' + userId);
  await del('push_subscriptions', 'user_id=eq.' + userId);
  await del('jobs',         'owner_id=eq.' + userId);
  await del('profiles',     'id=eq.' + userId);

  // 3) Auth-Konto endgültig löschen
  try {
    const r = await sb('/auth/v1/admin/users/' + userId, { method: 'DELETE' });
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'Konto konnte nicht gelöscht werden: ' + t.slice(0, 200) });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Konto konnte nicht gelöscht werden.' });
  }

  return res.status(200).json({ ok: true });
};
