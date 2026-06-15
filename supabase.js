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
      return unwrap(await sb.from('profiles').select('*').in('id', list));
    },

    /* ───────── PUBLIC PROFILE + LIVE-STATISTIKEN ───────── */
    async getPublicProfile(id) {
      if (!id) return null;
      var prof = await this.getProfile(id);
      if (!prof) return null;
      var created = 0, completed = 0;
      try {
        // Genaue Zählung via SECURITY-DEFINER-Funktion (zählt auch abgeschlossene Jobs trotz RLS)
        var st = await sb.rpc('public_profile_stats', { uid: id });
        if (!st.error && st.data && st.data[0]) {
          created = Number(st.data[0].created_jobs) || 0;
          completed = Number(st.data[0].completed_jobs) || 0;
        } else {
          var c1 = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('user_id', id);
          created = c1.count || 0;
        }
      } catch (e) { console.warn('[SR] profile stats', e && e.message); }
      return Object.assign({}, prof, { created_jobs: created, completed_jobs: completed });
    },
    async updateProfile(userId, patch) {
      var res = await sb.from('profiles').update(patch).eq('id', userId).select().maybeSingle();
      if (res.error) throw res.error;
      return res.data;
    },

    /* ───────── AVATAR (Supabase Storage, Bucket "avatars") ───────── */
    async uploadAvatar(userId, blob, ext) {
      ext = (ext || 'jpg').toLowerCase();
      var path = userId + '/avatar_' + Date.now() + '.' + ext;
      var up = await sb.storage.from('avatars').upload(path, blob, {
        cacheControl: '3600', upsert: true,
        contentType: (blob && blob.type) || ('image/' + (ext === 'jpg' ? 'jpeg' : ext))
      });
      if (up.error) throw up.error;
      var pub = sb.storage.from('avatars').getPublicUrl(path);
      var url = pub.data && pub.data.publicUrl;
      await this.updateProfile(userId, { avatar_url: url });
      return url;
    },

    /* ───────── REVIEWS (Bewertungen) ───────── */
    async createReview(r) {
      // Spalte in public.reviews heißt reviewed_user_id (NICHT reviewee_id!).
      var reviewPayload = {
        job_id:           r.job_id || null,
        reviewer_id:      r.reviewer_id,
        reviewed_user_id: r.reviewed_user_id || r.reviewee_id,
        rating:           Number(r.rating),
        comment:          r.comment || null
      };
      console.error("REVIEW PAYLOAD:", reviewPayload);
      var res = await sb.from('reviews').insert(reviewPayload).select().single();
      if (res.error) { console.error("REVIEW INSERT ERROR:", res.error); throw res.error; }
      console.info("REVIEW INSERT OK:", res.data);
      return res.data;
    },
    async listReviews(reviewedUserId) {
      if (!reviewedUserId) return [];
      return unwrap(await sb.from('reviews')
        .select('*, reviewer:reviewer_id(full_name, avatar_url)')
        .eq('reviewed_user_id', reviewedUserId)
        .order('created_at', { ascending: false }));
    },

    /* ───────── SAVED JOBS (Merkliste / Favoriten) ───────── */
    async listSavedJobIds(userId) {
      if (!userId) return [];
      var data = unwrap(await sb.from('saved_jobs').select('job_id').eq('user_id', userId));
      return (data || []).map(function (r) { return r.job_id; });
    },
    async listSavedJobs(userId) {
      if (!userId) return [];
      return unwrap(await sb.from('saved_jobs')
        .select('job_id, created_at, jobs:job_id(*, profiles:user_id(id,full_name,email,city,avatar_url,rating))')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }));
    },
    async saveJob(userId, jobId) {
      var res = await sb.from('saved_jobs').insert({ user_id: userId, job_id: jobId }).select().single();
      if (res.error) { console.error('SAVED_JOBS INSERT ERROR:', res.error); throw res.error; }
      return res.data;
    },
    async unsaveJob(userId, jobId) {
      var res = await sb.from('saved_jobs').delete().eq('user_id', userId).eq('job_id', jobId);
      if (res.error) { console.error('SAVED_JOBS DELETE ERROR:', res.error); throw res.error; }
      return true;
    },

    /* ───────── PUSH SUBSCRIPTIONS (Status-Check / Deaktivieren via RLS) ───────── */
    // Liest die in Supabase gespeicherten Endpoints des eingeloggten Nutzers
    // (RLS „SELECT eigene" erlaubt nur die eigenen Zeilen).
    async listMyPushEndpoints(userId) {
      if (!userId) return [];
      var data = unwrap(await sb.from('push_subscriptions').select('endpoint').eq('user_id', userId));
      return (data || []).map(function (r) { return r.endpoint; });
    },
    async deletePushSubscription(userId, endpoint) {
      var res = await sb.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
      if (res.error) { console.error('Push delete error:', res.error); throw res.error; }
      return true;
    },

    /* ───────── JOBS ───────── */
    async listActiveJobs() {
      return unwrap(await sb.from('jobs')
        .select('*, profiles:user_id(id,full_name,email,city,avatar_url,rating)')
        .eq('status', 'active')
        .order('created_at', { ascending: false }));
    },
    async jobsByOwner(userId) {
      return unwrap(await sb.from('jobs')
        .select('*, profiles:user_id(id,full_name,email,city,avatar_url,rating)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }));
    },
    async getJobsByIds(ids) {
      var list = Array.from(new Set((ids || []).filter(Boolean)));
      if (!list.length) return [];
      return unwrap(await sb.from('jobs').select('*, profiles:user_id(id,full_name,email,city,avatar_url,rating)').in('id', list));
    },
    async getJob(id) {
      return unwrap(await sb.from('jobs').select('*, profiles:user_id(id,full_name,email,city,avatar_url,rating)').eq('id', id).maybeSingle());
    },
    async createJob(payload) {
      return unwrap(await sb.from('jobs').insert(payload).select('*, profiles:user_id(id,full_name,email,city,avatar_url,rating)').single());
    },
    async updateJob(id, patch) {
      return unwrap(await sb.from('jobs').update(patch).eq('id', id).select().single());
    },
    // ECHTES Löschen: RLS (jobs_delete_own) erlaubt nur dem Eigentümer das Löschen.
    // DB-Cascade entfernt zugehörige applications + messages; reviews.job_id wird NULL.
    async deleteJob(id) {
      var res = await sb.from('jobs').delete().eq('id', id);
      if (res.error) throw res.error;
      return true;
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
        .select('*, profiles:helper_id(id,full_name,email,avatar_url,rating)')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }));
    },
    // All applications received across a set of (owned) jobs.
    async listApplicationsForJobs(jobIds) {
      var list = Array.from(new Set((jobIds || []).filter(Boolean)));
      if (!list.length) return [];
      return unwrap(await sb.from('applications')
        .select('*, profiles:helper_id(id,full_name,email,avatar_url,rating), jobs:job_id(title)')
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
