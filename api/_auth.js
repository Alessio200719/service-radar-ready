// ============================================================
// Service Radar – gemeinsame Hilfsfunktion für Serverless Functions
// Prüft das Zugangs-Token des Aufrufers gegen Supabase und liefert die
// echte Nutzer-ID zurück. Nie der vom Client geschickten ID vertrauen!
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Liefert { id, email } des angemeldeten Nutzers oder null. */
async function verifyUser(req) {
  if (!SUPABASE_URL || !ANON_KEY) return null;

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
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + token },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: u.email || '' } : null;
  } catch (e) {
    return null;
  }
}

/** Body zuverlässig als Objekt lesen. */
function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b || {};
}

module.exports = { verifyUser, readBody };
