// ============================================================
// Service Radar – Vercel Serverless Function
// GET  /api/admin-reports        -> offene und erledigte Meldungen mit Kontext
// POST /api/admin-reports        -> Aktion ausführen
//      { report_id, action, reason? }
//      action: 'flag_job' | 'unflag_job' | 'delete_job'
//            | 'warn_user' | 'ban_user' | 'unban_user'
//            | 'mark_reviewed' | 'mark_closed'
// Nur für Betreiber (ADMIN_EMAILS). Nutzt SUPABASE_SERVICE_ROLE_KEY.
// ============================================================
const { createClient } = require('@supabase/supabase-js');
const { verifyAdmin } = require('./_admin');
const { readBody } = require('./_auth');

function db() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = async function handler(req, res) {
  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Kein Zugriff.' });

  const sb = db();
  if (!sb) return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.' });

  // ── Liste abrufen ──────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { data: reports, error } = await sb.from('reports')
        .select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;

      const rows = reports || [];
      const jobIds  = [...new Set(rows.filter(r => r.target_type === 'job').map(r => r.target_id))];
      const userIds = [...new Set(rows.filter(r => r.target_type === 'user').map(r => r.target_id))];
      const reporterIds = [...new Set(rows.map(r => r.reporter_id).filter(Boolean))];

      const jobs = {}, profiles = {}, bans = {};
      if (jobIds.length) {
        const j = await sb.from('jobs').select('id,title,description,price,city,status,user_id').in('id', jobIds);
        (j.data || []).forEach(x => { jobs[x.id] = x; });
      }
      const allProfileIds = [...new Set([...userIds, ...reporterIds, ...Object.values(jobs).map(j => j.user_id)])].filter(Boolean);
      if (allProfileIds.length) {
        const p = await sb.from('profiles').select('id,full_name,email,city,rating,review_count').in('id', allProfileIds);
        (p.data || []).forEach(x => { profiles[x.id] = x; });
        const b = await sb.from('user_bans').select('user_id,reason,until').in('user_id', allProfileIds);
        (b.data || []).forEach(x => { bans[x.user_id] = x; });
      }

      // Anzahl Meldungen je Ziel (zeigt Wiederholungstäter)
      const counts = {};
      rows.forEach(r => { const k = r.target_type + ':' + r.target_id; counts[k] = (counts[k] || 0) + 1; });

      const out = rows.map(r => ({
        ...r,
        job: r.target_type === 'job' ? (jobs[r.target_id] || null) : null,
        jobOwner: r.target_type === 'job' && jobs[r.target_id] ? (profiles[jobs[r.target_id].user_id] || null) : null,
        user: r.target_type === 'user' ? (profiles[r.target_id] || null) : null,
        reporter: r.reporter_id ? (profiles[r.reporter_id] || null) : null,
        banned: !!bans[r.target_type === 'user' ? r.target_id : (jobs[r.target_id] || {}).user_id],
        totalForTarget: counts[r.target_type + ':' + r.target_id] || 1,
      }));
      return res.status(200).json({ ok: true, reports: out });
    } catch (e) {
      console.error('[SR] admin-reports', e);
      return res.status(500).json({ error: (e && e.message) || 'error' });
    }
  }

  // ── Aktion ausführen ───────────────────────────────────────
  if (req.method === 'POST') {
    const b = readBody(req);
    const id = String(b.report_id || '');
    const action = String(b.action || '');
    const reason = String(b.reason || 'Verstoß gegen die Nutzungsbedingungen').slice(0, 200);
    if (!id || !action) return res.status(400).json({ error: 'report_id und action erforderlich.' });

    try {
      const { data: rep } = await sb.from('reports').select('*').eq('id', id).maybeSingle();
      if (!rep) return res.status(404).json({ error: 'Meldung nicht gefunden.' });

      // Betroffenen Nutzer ermitteln (bei Auftrags-Meldungen der Ersteller)
      let targetUser = rep.target_type === 'user' ? rep.target_id : null;
      if (rep.target_type === 'job') {
        const j = await sb.from('jobs').select('user_id').eq('id', rep.target_id).maybeSingle();
        targetUser = (j.data && j.data.user_id) || null;
      }

      if (action === 'flag_job')    await sb.from('jobs').update({ status: 'flagged' }).eq('id', rep.target_id);
      if (action === 'unflag_job')  await sb.from('jobs').update({ status: 'active'  }).eq('id', rep.target_id);
      if (action === 'delete_job')  await sb.from('jobs').delete().eq('id', rep.target_id);

      if (action === 'warn_user' && targetUser) {
        await sb.from('user_warnings').insert({ user_id: targetUser, reason });
        const c = await sb.from('user_warnings').select('id', { count: 'exact', head: true }).eq('user_id', targetUser);
        if (typeof c.count === 'number' && c.count >= 3) {
          await sb.from('user_bans').upsert({ user_id: targetUser, reason: 'Automatisch: 3 Verwarnungen' }, { onConflict: 'user_id' });
        }
      }
      if (action === 'ban_user' && targetUser)
        await sb.from('user_bans').upsert({ user_id: targetUser, reason }, { onConflict: 'user_id' });
      if (action === 'unban_user' && targetUser)
        await sb.from('user_bans').delete().eq('user_id', targetUser);

      if (action === 'mark_reviewed') await sb.from('reports').update({ status: 'reviewed' }).eq('id', id);
      if (action === 'mark_closed')   await sb.from('reports').update({ status: 'closed'   }).eq('id', id);

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[SR] admin-action', e);
      return res.status(500).json({ error: (e && e.message) || 'error' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
