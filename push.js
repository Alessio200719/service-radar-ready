// ============================================================
// Service Radar – Web Push (drei Schritte in EINER Funktion)
//
//   /api/vapid-public-key        -> action=vapid  (GET)
//   /api/save-push-subscription  -> action=save   (POST)
//   /api/send-push-notification  -> action=send   (POST)
//
// Die alten Adressen bleiben gültig – vercel.json leitet sie hierher um.
// Grund: Der kostenlose Vercel-Tarif erlaubt höchstens 12 Funktionen.
// ============================================================
'use strict';
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
// ============================================================
// Service Radar – Vercel Serverless Function
// GET /api/vapid-public-key
// Liefert den ÖFFENTLICHEN VAPID-Key ans Frontend (zum Subscriben).
// Der PRIVATE Key bleibt ausschließlich serverseitig.
// ============================================================
// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/save-push-subscription
// Speichert/aktualisiert die Web-Push-Subscription eines Nutzers in Supabase.
// Nutzt den SUPABASE_SERVICE_ROLE_KEY (nur serverseitig!).
// Body: { user_id, subscription }  (subscription = das PushSubscription-Objekt)
// ============================================================
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
// ============================================================
// Service Radar – Vercel Serverless Function
// POST /api/send-push-notification
// Sendet eine Web-Push-Benachrichtigung an einen Nutzer.
//
// SICHERHEIT (wichtig):
//  1. Der Aufrufer muss angemeldet sein (Token wird gegen Supabase geprüft).
//  2. Titel, Text und Ziel-Adresse kommen NICHT vom Client, sondern aus festen
//     Vorlagen. Sonst liessen sich in deinem Namen Phishing-Nachrichten senden.
//  3. Es wird geprüft, ob zwischen Absender und Empfänger überhaupt eine
//     Beziehung besteht (Chat, Bewerbung oder Bewertung).
//  4. Einfache Bremse: höchstens 20 Benachrichtigungen pro Nutzer und Stunde.
//
// Body: { access_token, user_id (Empfänger), kind, jobTitle?, lang? }
//   kind: 'message' | 'application' | 'review' | 'job_done'
// ============================================================


const RATE_MAX = 20;          // Benachrichtigungen
const RATE_WINDOW_MS = 3600e3; // pro Stunde
const _rate = new Map();       // caller-id -> [timestamps]

function rateOk(id) {
  const now = Date.now();
  const list = (_rate.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) { _rate.set(id, list); return false; }
  list.push(now); _rate.set(id, list);
  return true;
}

function template(kind, lang, jobTitle) {
  const de = lang !== 'en';
  const t = String(jobTitle || '').slice(0, 60);
  switch (kind) {
    case 'message':
      return { title: 'Service Radar', body: de ? 'Du hast eine neue Nachricht erhalten.' : 'You have a new message.' };
    case 'application':
      return { title: de ? 'Neue Bewerbung' : 'New application',
               body: de ? ('Jemand möchte deinen Auftrag übernehmen' + (t ? ': ' + t : '.')) 
                        : ('Someone applied for your job' + (t ? ': ' + t : '.')) };
    case 'review':
      return { title: de ? 'Neue Bewertung' : 'New review',
               body: de ? 'Du hast eine neue Bewertung erhalten.' : 'You received a new review.' };
    case 'job_done':
      return { title: de ? 'Auftrag abgeschlossen' : 'Job completed',
               body: de ? 'Ein Auftrag wurde als abgeschlossen markiert.' : 'A job was marked as completed.' };
    default:
      return null;
  }
}

/** Besteht zwischen Absender und Empfänger eine legitime Beziehung? */
async function related(sb, kind, fromId, toId) {
  try {
    if (kind === 'message') {
      const a = await sb.from('messages').select('id')
        .or('and(sender_id.eq.' + fromId + ',receiver_id.eq.' + toId + '),' +
            'and(sender_id.eq.' + toId + ',receiver_id.eq.' + fromId + ')').limit(1);
      return !!(a.data && a.data.length);
    }
    if (kind === 'application' || kind === 'job_done') {
      // Absender und Empfänger müssen über einen gemeinsamen Auftrag verbunden sein.
      const own = await sb.from('jobs').select('id').eq('user_id', toId).limit(200);
      const ids = (own.data || []).map((r) => r.id);
      if (ids.length) {
        const ap = await sb.from('applications').select('id').eq('helper_id', fromId).in('job_id', ids).limit(1);
        if (ap.data && ap.data.length) return true;
      }
      const mine = await sb.from('jobs').select('id').eq('user_id', fromId).limit(200);
      const mids = (mine.data || []).map((r) => r.id);
      if (mids.length) {
        const ap2 = await sb.from('applications').select('id').eq('helper_id', toId).in('job_id', mids).limit(1);
        if (ap2.data && ap2.data.length) return true;
      }
      return false;
    }
    if (kind === 'review') {
      const rv = await sb.from('reviews').select('id')
        .eq('reviewer_id', fromId).eq('reviewed_user_id', toId).limit(1);
      return !!(rv.data && rv.data.length);
    }
  } catch (e) {
    console.error('[SR] push relation check', e && e.message);
  }
  return false;
}

async function doVapid(req, res) {
  const key = process.env.VAPID_PUBLIC_KEY || '';
  if (!key) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY nicht gesetzt.' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({ publicKey: key });
}

async function doSave(req, res) {
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
}

async function doSend(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY fehlen.' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.' });

  // 1) Aufrufer prüfen
  const caller = await verifyUser(req);
  if (!caller) return res.status(401).json({ error: 'Nicht angemeldet.' });
  if (!rateOk(caller.id)) return res.status(429).json({ error: 'Zu viele Benachrichtigungen.' });

  const body = readBody(req);
  const toId = String(body.user_id || '');
  const kind = String(body.kind || '');
  if (!toId) return res.status(400).json({ error: 'user_id erforderlich.' });
  if (toId === caller.id) return res.status(200).json({ sent: 0, note: 'self' });

  // 2) Inhalt aus fester Vorlage – nichts vom Client übernehmen
  const tpl = template(kind, body.lang, body.jobTitle);
  if (!tpl) return res.status(400).json({ error: 'Unbekannte Benachrichtigungsart.' });

  try {
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:info@service-radar.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // 3) Beziehung prüfen
    if (!(await related(sb, kind, caller.id, toId))) {
      return res.status(403).json({ error: 'Keine Berechtigung für diesen Empfänger.' });
    }

    const { data: subs, error } = await sb.from('push_subscriptions').select('endpoint, subscription').eq('user_id', toId);
    if (error) { console.error('Push send error:', error); return res.status(500).json({ error: error.message }); }
    if (!subs || !subs.length) return res.status(200).json({ sent: 0, removed: 0, note: 'no subscriptions' });

    // Ziel immer die eigene Startseite – niemals eine vom Client gelieferte Adresse.
    const site = (process.env.SITE_URL && process.env.SITE_URL.replace(/\/+$/, '')) || '';
    const payload = JSON.stringify({
      title: tpl.title, body: tpl.body, url: (site || '') + '/', icon: '/icon-192.png',
    });

    let sent = 0, removed = 0;
    for (const row of subs) {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
      } catch (e) {
        const code = e && e.statusCode;
        if (code === 404 || code === 410) {
          try { await sb.from('push_subscriptions').delete().eq('endpoint', row.endpoint); removed++; } catch (x) {}
        } else {
          console.error('Push send error:', code, e && e.message);
        }
      }
    }
    return res.status(200).json({ sent, removed });
  } catch (e) {
    console.error('Push send error:', e);
    return res.status(500).json({ error: (e && e.message) || 'error' });
  }
}

module.exports = async function handler(req, res) {
  const action = String((req.query && req.query.action) || '').toLowerCase();
  if (action === 'vapid') return doVapid(req, res);
  if (action === 'save')  return doSave(req, res);
  if (action === 'send')  return doSend(req, res);
  if (req.method === 'GET') return doVapid(req, res);
  return res.status(400).json({ error: 'Unbekannte Aktion.' });
};
