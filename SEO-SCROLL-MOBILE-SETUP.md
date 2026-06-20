# Service Radar – Scroll-/Mobile-Fixes + SEO/Blog/Newsletter

Diese Version behebt die Scroll-Probleme, verbessert die mobile Nutzung und ergänzt
eine plattform-passende SEO-Architektur (echte Daten statt Stadtseiten-Spam), Blog und
Newsletter. **Bestehende Funktionen (Auth, Supabase, Stripe, Chat, Bewertungen, Push)
wurden nicht verändert.**

---

## 1. Scroll-Fixes (P0/P1/P2) – nur `index.html`

| Problem | Ursache | Fix |
|---|---|---|
| Seite nach Modal + Bottom-Nav nicht mehr scrollbar | `_closeAllModals()` setzte den Scroll-Lock nicht zurück | `_closeAllModals` ruft jetzt `unlockScroll()` + Zähler-Reset |
| Sprung beim Öffnen/Schließen (iOS) | `body{overflow:hidden}` unzuverlässig | iOS-sicherer Lock: `body.modal-lock{position:fixed}` + gemerkte `scrollY` |
| Hakeln/Blockieren an inneren Listen | kein `overscroll-behavior` | `overscroll-behavior:contain` auf jlist/Chat/Modals/Menü |
| Jobliste mobil als Scroll-Falle | `.jlist{height:260px}` | mobil `height:auto` (fließt im Seitenfluss) |
| Sprung beim Ein-/Ausblenden der Adressleiste | `min-height:100vh` | mobil `100svh` |
| Anker landen unter der Navi | fehlendes `scroll-padding-top` | `scroll-padding-top:76px` |
| Karte blockiert Seiten-Scroll mobil | Leaflet fängt 1-Finger-Touch | mobil `cooperativeGestures` (1 Finger scrollt, 2 bewegen die Karte) |

Touch-Politur: größere Filter-Chips (≥40 px), `-webkit-tap-highlight-color:transparent`,
`user-select:none` auf Bedienelementen. **Desktop bleibt unverändert** (alles in Media
Queries bzw. additive Helfer).

---

## 2. SEO – neue Routen (Serverless-SSR, echte Job-Daten)

Routing über `vercel.json` (`cleanUrls` + `rewrites`):

| URL | Datei | Inhalt |
|---|---|---|
| `/leistungen` | `api/leistungen.js` | Übersicht aller Leistungen |
| `/leistungen/gartenarbeit` … | `api/leistungen.js?cat=` | Kategorie-Seite **mit aktuellen Jobs** aus Supabase |
| `/jobs/stuttgart` … | `api/jobs-city.js?city=` | Stadtseite **aus echten Jobs** – `noindex`, solange < `SEO_CITY_MIN_JOBS` aktive Jobs (kein Thin-Content-Spam) |
| `/sitemap.xml` | `api/sitemap.js` | dynamisch: Kernseiten + Leistungen + Blog + Städte mit genug Jobs |
| `/robots.txt` | statisch | verweist auf die Sitemap |

Leistungs-Slugs: `gartenarbeit, reinigung, haushaltshilfe, umzugshilfe, nachhilfe, handwerk, sonstiges`.
Stadtseiten entstehen **automatisch** aus den Orten echter Aufträge – keine manuelle Pflege.

`index.html` (Startseite) wurde ergänzt um: Canonical, Open Graph, Twitter Cards,
Theme-Color, Apple-PWA-Tags, `manifest.webmanifest`, Preconnects, JSON-LD
(Organization, WebSite+SearchAction), eine sichtbare **FAQ-Sektion** mit FAQ-Schema,
sowie interne Links zu `/leistungen` und `/blog`.

---

## 3. Blog – statisch (`/blog`)

`/blog` (Index) + 5 fertige Artikel unter `/blog/<slug>` (cleanUrls), gemeinsame
`blog/blog.css` + `blog/blog.js`, je mit Article- und Breadcrumb-JSON-LD und internen
Links zu Leistungen/Jobs. Artikel:
`nebenjob-finden-in-deiner-region`, `haushaltshilfe-finden`, `was-kostet-gartenarbeit`,
`tipps-fuer-auftraggeber`, `tipps-fuer-helfer`.

---

## 4. Newsletter – Double-Opt-in (DSGVO)

- SQL: **`supabase_newsletter.sql`** im Supabase SQL-Editor ausführen (Tabelle
  `newsletter_subscribers`, RLS aktiv, nur Server-Zugriff).
- `api/newsletter-subscribe.js` (POST `{email}`) speichert die Adresse unbestätigt +
  Token und versendet die Bestätigungs-Mail über **Resend** (`RESEND_API_KEY`).
- `api/newsletter-confirm.js` (GET `?token=`) bestätigt die Anmeldung.
- Anmeldeformulare: Footer der App, alle SSR-Seiten und alle Blog-Seiten.

> Ohne `RESEND_API_KEY` wird die Adresse gespeichert, aber **keine** Mail versendet
> (Opt-in kann dann nicht abgeschlossen werden). Resend-Domain vorher verifizieren.

---

## 5. Environment-Variablen (Vercel → Settings → Environment Variables)

| Variable | Zweck |
|---|---|
| `SITE_URL` | Basis-URL für Canonicals/Links (z. B. `https://service-radar.com`) |
| `SUPABASE_URL` | Supabase-Projekt-URL (Server) |
| `SUPABASE_ANON_KEY` | öffentlicher Key für SSR-Reads (RLS schützt) |
| `SUPABASE_SERVICE_ROLE_KEY` | nur Server (Newsletter schreiben) |
| `SEO_CITY_MIN_JOBS` | Schwelle Indexierung Stadtseiten (Default 3) |
| `RESEND_API_KEY` | Versand Bestätigungs-Mail (Newsletter) |
| `NEWSLETTER_FROM` | Absender (verifizierte Domain) |

Bestehende Variablen (Stripe, VAPID) bleiben unverändert.

---

## 6. Deploy-Hinweis (wichtig!)

Damit die neuen Funktionen live gehen, müssen **alle Ordner** mit deployt werden –
insbesondere `api/` (mit `_ssr.js`, `leistungen.js`, `jobs-city.js`, `sitemap.js`,
`newsletter-*.js`) und `blog/` sowie die Root-Dateien `vercel.json`, `robots.txt`,
`manifest.webmanifest`, `og-image.png`, `icon-512.png`.

**Per Git committen + pushen** (nicht per Drag-&-Drop einzelner Dateien – sonst fehlen
Unterordner). Danach in der Vercel-Functions-Übersicht prüfen, dass `leistungen`,
`jobs-city`, `sitemap`, `newsletter-subscribe`, `newsletter-confirm` erscheinen.

Test nach Deploy: `/leistungen`, `/leistungen/gartenarbeit`, `/jobs/<deine-stadt>`,
`/sitemap.xml`, `/robots.txt`, `/blog`, und im Footer eine Test-E-Mail eintragen.
