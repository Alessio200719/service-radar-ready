// ============================================================
// Service Radar – Supabase data layer (CLASSIC script, no ES modules).
// Loaded via <script defer src="supabase.js"></script> AFTER the Supabase
// UMD bundle (which defines window.supabase). Using a classic script means
// this also works when index.html is opened directly via file:// — ES modules
// would be CORS-blocked there.
//
// Exposes window.SR (async API) + window.sb (raw client) and fires the
// "sr-ready" event. Only the PUBLIC anon key is used in the frontend –
// Row-Level-Security (supabase_schema.sql) protects the data. NEVER put the
// service_role key here.
// ============================================================
(function () {
  function cfg(key, fallback) {
    if (typeof window !== 'undefined' && window.__ENV && window.__ENV[key]) return window.__ENV[key];
    return fallback;
  }
  var SUPABASE_URL      = cfg('VITE_SUPABASE_URL',      'https://myatdrjwcydowtlxcoyz.supabase.co');
  var SUPABASE_ANON_KEY = cfg('VITE_SUPABASE_ANON_KEY', 'sb_publishable_Pl3xwsNbuj75LQICJ9ACPw_duac4rhC');

  // Where confirmation / magic links should send users back to.
  // Priority: explicit override → current site origin → production domain.
  // Using window.location.origin means it auto-adapts to the live custom domain
  // OR the current Vercel domain (no hardcoding needed). The chosen URL MUST be
  // added to Supabase → Authentication → URL Configuration → Redirect URLs.
  function siteUrl() {
    var o = (typeof window !== 'undefined' && window.__ENV && (window.__ENV.VITE_SITE_URL || window.__ENV.SITE_URL)) || '';
    if (o) return String(o).replace(/\/+$/, '');
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null')
      return window.location.origin;
    return 'https://service-radar.com';
  }

  function ready() {
    window.__SR_READY = true;
    try { window.dispatchEvent(new Event('sr-ready')); } catch (e) {}
  }

  // Guard: the UMD bundle must have loaded first.
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[SR] Supabase SDK not loaded (window.supabase missing). ' +
      'Check the @supabase/supabase-js script tag / network. Auth & data are disabled.');
    ready(); // unblock whenSRReady() so the UI can show a clear error instead of hanging
    return;
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  console.info('[SR] Supabase client initialised →', SUPABASE_URL);

  function unwrap(res) { if (res.error) throw res.error; return res.data; }

  var SR = {
    client: sb,

    /* ───────── AUTH ───────── */
    async signUp(email, password, meta) {
      meta = meta || {};
      var res = await sb.auth.signUp({
        email: email, password: password,
        options: {
          emailRedirectTo: siteUrl(),   // confirmation link returns here (NOT localhost)
          data: { full_name: meta.full_name || '', role: meta.role || 'jobber', city: meta.city || '' }
        }
      });
      if (res.error) throw res.error;
      return { user: res.data.user, session: res.data.session, needsConfirmation: !res.data.session };
    },
    async signIn(email, password) {
      var res = await sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) throw res.error;
      return res.data;
    },
    async signOut() { var res = await sb.auth.signOut(); if (res.error) throw res.error; },
    async getSession() { var res = await sb.auth.getSession(); return (res.data && res.data.session) || null; },
    async getUser() { var res = await sb.auth.getUser(); return (res.data && res.data.user) || null; },
    onAuthChange(cb) { return sb.auth.onAuthStateChange(function (event, session) { cb(event, session); }); },

    /* ───────── PROFILES ───────── */
    async getProfile(id) {
      var res = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
      if (res.error) throw res.error;
      return res.data;
    },
    // Resilient: NEVER throws – returns a usable profile even if the profiles
    // table is missing/misconfigured, so login can always complete.
    async ensureProfile(user, meta) {
      meta = meta || {};
      if (!user) return null;
      var um = user.user_metadata || {};
      var fallback = {
        id: user.id, user_id: user.id, email: user.email,
        full_name: meta.full_name || um.full_name || (user.email || '').split('@')[0],
        role: meta.role || um.role || 'jobber',
        city: meta.city || um.city || '',
        created_at: user.created_at || null
      };
      try {
        var got = await this.getProfile(user.id);
        if (got) return Object.assign({}, fallback, got);   // DB row wins, fallback fills gaps
      } catch (e) { console.warn('[SR] getProfile failed, using auth metadata:', e && e.message); }
      try {
        var res = await sb.from('profiles').upsert({
          id: user.id, user_id: user.id, email: user.email,
          full_name: fallback.full_name, role: fallback.role, city: fallback.city
        }).select().maybeSingle();
        if (!res.error && res.data) return Object.assign({}, fallback, res.data);
        if (res.error) console.warn('[SR] profile upsert failed, using auth metadata:', res.error.message);
      } catch (e) { console.warn('[SR] profile upsert threw, using auth metadata:', e && e.message); }
      return fallback;
    },
    async getProfilesByIds(ids) {
      var list = Array.from(new Set((ids || []).filter(Boolean)));
      if (!list.length) return [];
      return unwrap(await sb.from('profiles').select('id,full_name,city,role').in('id', list));
    },

    /* ───────── JOBS ───────── */
    async listActiveJobs() {
      return unwrap(await sb.from('jobs')
        .select('*, profiles:user_id(full_name, city)')
        .eq('status', 'active')
        .order('created_at', { ascending: false }));
    },
    async jobsByOwner(userId) {
      return unwrap(await sb.from('jobs')
        .select('*, profiles:user_id(full_name, city)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }));
    },
    async getJobsByIds(ids) {
      var list = Array.from(new Set((ids || []).filter(Boolean)));
      if (!list.length) return [];
      return unwrap(await sb.from('jobs').select('*, profiles:user_id(full_name, city)').in('id', list));
    },
    async getJob(id) {
      return unwrap(await sb.from('jobs').select('*, profiles:user_id(full_name, city)').eq('id', id).maybeSingle());
    },
    async createJob(payload) {
      return unwrap(await sb.from('jobs').insert(payload).select('*, profiles:user_id(full_name, city)').single());
    },
    async updateJob(id, patch) {
      return unwrap(await sb.from('jobs').update(patch).eq('id', id).select().single());
    },

    /* ───────── APPLICATIONS ───────── */
    async createApplication(a) {
      return unwrap(await sb.from('applications')
        .upsert({ job_id: a.job_id, helper_id: a.helper_id, message: a.message, status: 'sent' }, { onConflict: 'job_id,helper_id' })
        .select().single());
    },
    async listApplicationsByHelper(helperId) {
      return unwrap(await sb.from('applications')
        .select('*, jobs:job_id(id,title,price,category,user_id,status)')
        .eq('helper_id', helperId)
        .order('created_at', { ascending: false }));
    },
    async listApplicationsForJob(jobId) {
      return unwrap(await sb.from('applications')
        .select('*, profiles:helper_id(full_name)')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }));
    },
    // All applications received across a set of (owned) jobs.
    async listApplicationsForJobs(jobIds) {
      var list = Array.from(new Set((jobIds || []).filter(Boolean)));
      if (!list.length) return [];
      return unwrap(await sb.from('applications')
        .select('*, profiles:helper_id(full_name), jobs:job_id(title)')
        .in('job_id', list)
        .order('created_at', { ascending: false }));
    },

    /* ───────── MESSAGES (chat) ───────── */
    async listMyMessages(me) {
      return unwrap(await sb.from('messages')
        .select('*')
        .or('sender_id.eq.' + me + ',receiver_id.eq.' + me)
        .order('created_at', { ascending: true }));
    },
    async listThread(jobId, me, other) {
      return unwrap(await sb.from('messages')
        .select('*')
        .eq('job_id', jobId)
        .or('and(sender_id.eq.' + me + ',receiver_id.eq.' + other + '),and(sender_id.eq.' + other + ',receiver_id.eq.' + me + ')')
        .order('created_at', { ascending: true }));
    },
    async sendMessage(m) {
      return unwrap(await sb.from('messages')
        .insert({ job_id: m.job_id, sender_id: m.sender_id, receiver_id: m.receiver_id, message: m.message })
        .select().single());
    },
    subscribeMessages(me, cb) {
      var ch = sb.channel('sr-messages-' + me)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, function (payload) {
          var m = payload.new;
          if (m && (m.sender_id === me || m.receiver_id === me)) cb(m);
        })
        .subscribe();
      return ch;
    },
    removeChannel(ch) { try { sb.removeChannel(ch); } catch (e) {} }
  };

  window.sb = sb;
  window.SR = SR;
  ready();
})();
