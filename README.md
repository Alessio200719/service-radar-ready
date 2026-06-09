# Service Radar — Projektstruktur

```
service-radar/
├─ index.html                      ← die Website (eine Datei)
└─ assets/
   ├─ legal/                       ← echte PDF-Dateien (vorher Base64 im JS)
   │  ├─ ServiceRadar_AGB.pdf
   │  ├─ ServiceRadar_Datenschutz.pdf
   │  ├─ ServiceRadar_Impressum.pdf
   │  ├─ ServiceRadar_Nutzungsbedingungen.pdf
   │  └─ ServiceRadar_Cookie-Richtlinie.pdf
   └─ vendor/                      ← lokal gehostete Bibliotheken (kein CDN)
      ├─ leaflet.css               ← enthalten
      ├─ README-LEAFLET.md         ← Anleitung für leaflet.js
      └─ leaflet.js                ← enthalten (eigenständige Mini-Karten-Lib, kein CDN)
```

## Lokal starten
Wegen relativer Pfade (`assets/...`) am besten über einen kleinen Webserver öffnen:

```bash
cd service-radar
python3 -m http.server 8000
# Browser: http://localhost:8000
```

`index.html` per Doppelklick (file://) funktioniert ebenfalls; manche Browser
laden PDFs aus `file://` aber nur im neuen Tab.

## Karte
`assets/vendor/leaflet.js` ist **enthalten** – eine eigenständige, lokale Mini-Karten-
Bibliothek (Pan/Zoom/Marker/Radius) mit OpenStreetMap-Tiles. Es wird **kein CDN** für die
Karten-Lib geladen. Nur falls die lokale Datei fehlt, greift als Notfall ein CDN bzw. eine
statische OSM-Karte. (Die Karten-*Tiles* kommen wie üblich von OpenStreetMap.)

## Sprache
DE/EN-Umschalter oben rechts (und im Mobile-Menü). Die Auswahl wird in
`localStorage` (`sr_lang`) gespeichert und beim nächsten Besuch wiederhergestellt.

---

## Supabase-Backend (Pflicht-Setup)

Nutzer, Aufträge, Bewerbungen und Chat laufen über **Supabase** (nicht mehr
localStorage). Damit die Seite echte Daten speichert, sind **zwei** einmalige
Schritte nötig:

### 1) Datenbank-Schema anlegen
> **Fehler `operator does not exist: uuid = bigint`?** Deine alten Tabellen nutzen
> noch `bigint`-IDs. Führe dann **`supabase_schema_RESET.sql`** aus – es löscht die
> 4 `public`-Tabellen und legt sie korrekt mit **UUID** neu an. **Deine Nutzer in
> `auth.users` bleiben erhalten**, Profile werden per Trigger + Backfill neu erzeugt.

Supabase Dashboard → **SQL Editor** → den kompletten Inhalt von
`supabase_schema.sql` einfügen und ausführen. Das legt an:
`profiles`, `jobs`, `applications`, `messages` inkl. **Row-Level-Security**,
einem **Trigger** (Profil wird bei Registrierung automatisch erstellt) und
aktiviert **Realtime** für den Chat.

### 2) Auth-Einstellungen
Dashboard → **Authentication → Providers → Email** aktivieren.
- **E-Mail-Bestätigung AN** (empfohlen): Nach der Registrierung erscheint der
  Hinweis „E-Mail bestätigen“; nach Klick im Mail-Link kann man sich anmelden.
- **E-Mail-Bestätigung AUS** (schnelles Testen): Nutzer ist sofort eingeloggt.

Die App kommt mit **beiden** Einstellungen zurecht.

### 2b) E-Mail-Bestätigungslink zeigt auf localhost → so behoben
Standardmäßig nutzt Supabase die **Site URL** als Ziel der Bestätigungslinks –
ab Werk `http://localhost:3000`. Das musst du **einmal im Dashboard** umstellen
(kann nur dort gesetzt werden):

**Dashboard → Authentication → URL Configuration**
- **Site URL:** `https://service-radar.com`
  *(solange die Domain noch nicht live ist: deine aktuelle Vercel-URL, z. B. `https://service-radar.vercel.app`)*
- **Redirect URLs** (jede in einer Zeile hinzufügen):
  - `https://service-radar.com`
  - `https://service-radar.com/**`
  - `https://<dein-projekt>.vercel.app/**`  *(deine Vercel-Domain)*
  - `http://localhost:5173/**`, `http://localhost:8000/**`  *(optional, lokales Testen)*

Der Code sendet zusätzlich automatisch `emailRedirectTo` (= aktuelle Domain bzw.
`VITE_SITE_URL`), damit der Link **immer** auf die richtige Seite zurückführt.
Nach Klick im Bestätigungs-Mail landet der Nutzer wieder auf Service Radar und ist
**automatisch angemeldet** (`detectSessionInUrl` + `onAuthStateChange`).

> Wichtig: Die Ziel-URL muss in der **Redirect-URLs-Liste** stehen, sonst ignoriert
> Supabase `emailRedirectTo` und fällt auf die Site URL zurück.

### Konfiguration / Keys
`SUPABASE_URL` und der **öffentliche Anon-Key** stehen als Fallback bereits in
`supabase.js` – die Seite funktioniert also sofort. Optional überschreibbar über:
- **Vite-Build:** `.env` mit `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (siehe `.env.example`).
- **Statisches Hosting:** vor `supabase.js` ein kleines Script setzen:
  `<script>window.__ENV={VITE_SUPABASE_URL:'…',VITE_SUPABASE_ANON_KEY:'…'}</script>`

> Sicherheit: Im Frontend wird **ausschließlich der Anon-Key** verwendet (öffentlich,
> dafür vorgesehen). Der `service_role`-Key gehört **niemals** ins Frontend/Repo.

## Deployment auf Vercel
Die Seite ist eine **statische** Site (kein Build nötig).
- **New Project → Framework Preset: „Other“**, Root = dieser Ordner, kein Build-Command, Output = `.`.
- Optional unter **Settings → Environment Variables**: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (sonst greift der Fallback in `supabase.js`).
- Wichtig: `assets/legal/`, `assets/vendor/`, `supabase.js` und `index.html`
  mit deployen. Das Supabase-SDK (UMD) wird als klassisches Script vom CDN (jsDelivr) geladen.

## Was läuft jetzt über Supabase
- **Registrierung/Login/Logout/Session** → Supabase Auth (bleibt nach Reload angemeldet).
- **Profile** → Tabelle `profiles` (automatisch bei Registrierung).
- **Aufträge** → Tabelle `jobs`; Karte/Liste zeigen **nur echte** Jobs (keine Demo-Jobs).
- **Bewerbungen** → Tabelle `applications`.
- **Chat** → Tabelle `messages` (inkl. Realtime).
- Keine `localStorage`-Speicherung mehr für Nutzer/Jobs/Bewerbungen/Nachrichten.
