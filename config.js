/* ============================================================
   Service Radar – Frontend-Konfiguration
   ------------------------------------------------------------
   REINE HTML/JS-Seite, KEIN Build-System nötig.
   In einer statischen Seite funktionieren VITE_* Environment-
   Variablen NICHT automatisch im Browser – deshalb werden die
   Supabase-Werte hier (und nur hier) gesetzt.

   Werte findest du im Supabase Dashboard → Project Settings → API:
   - "Project URL"      → VITE_SUPABASE_URL
   - "anon"/"publishable" public key → VITE_SUPABASE_ANON_KEY
   Der öffentliche Key darf im Frontend stehen (RLS schützt die Daten).
   Den service_role / secret Key NIEMALS hier eintragen.

   Diese Datei wird VOR supabase.js geladen und füllt window.__ENV.
   ============================================================ */
window.__ENV = {
  VITE_SUPABASE_URL:      'https://myatdrjwcydowtlxcoyz.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_Pl3xwsNbuj75LQICJ9ACPw_duac4rhC'

  // Optional: feste Rücksprung-Domain für E-Mail-Bestätigungslinks.
  // Leer lassen = automatisch die aktuelle Domain.
  // , VITE_SITE_URL: 'https://service-radar.com'
};
