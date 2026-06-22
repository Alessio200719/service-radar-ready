# Service Radar — Redesign: Designsystem & Strategie

Premium-Neukonzeption im Stil **Apple × Airbnb × Linear × Notion × Stripe**.
Begleitend zum lauffähigen Prototyp unter `redesign/index.html` (separate Datei – die
Live-App bleibt unberührt; Migration in Phasen, siehe Punkt 11/12).

---

## 1. UX-Analyse (Ist-Zustand)

Service Radar ist heute technisch solide, aber **als Landingpage gebaut, nicht als App**.
Der wertschöpfende Kern-Loop — *Suchen → Entdecken → Vertrauen aufbauen → Handeln* — ist
über die Seite verstreut: Der erste Bildschirm verkauft, statt funktionieren zu lassen.
Auf einer Plattform, die mobil und „app-first" 100 M Nutzer bedienen soll, kostet das
Conversion in genau dem Moment, in dem Absicht am höchsten ist (Erstkontakt).

Die drei Kern-Personas und ihr „Job to be done":
- **Auftraggeber:** „Ich habe ein konkretes Problem und will schnell jemandem Vertrauen­swürdigen das geben." → braucht: sofort einstellen, Preisorientierung, Vertrauenssignale der Helfer.
- **Helfer:** „Ich will lokal & flexibel dazuverdienen." → braucht: schnelles Finden relevanter Aufträge in der Nähe, geringe Reibung beim Bewerben.
- **Erstbesucher:** „Ist das seriös?" → muss in 3 Sekunden verstehen *was/warum/nächster Schritt*.

## 2. Aktuelle Probleme (konkret)

1. **IA:** Marktplatz ist eine Sektion *innerhalb* einer Landingpage statt das Produkt selbst.
2. **Hero dekorativ statt funktional** (Headline + Radar-Animation; keine Suche im First Paint).
3. **Visuelle Sprache „Startup 2018":** Blau/Grün-Verläufe, bunte Kategorie-Pills, kräftige Schatten — widerspricht „luxuriös/ruhig/zeitlos".
4. **Karten info-dicht & laut** (farbige Labels, mehrere Akzentfarben pro Karte) → keine klare Hierarchie.
5. **Vertrauen verstreut** statt als durchgehendes System (Rating, Verifizierung, Aktivität, Sicherheit).
6. **Navigation uneinheitlich:** Top-Nav + Bottom-Nav, aber kein konsistenter App-Shell mit klaren Tab-Zielen.
7. **Mobile wirkt nachgereicht** (responsive Anpassungen), nicht „first-class".
8. **Motion fehlt** als Qualitäts-/Vertrauenssignal (kein Reveal, keine Micro-Interactions, keine Skeletons).
9. **Typografie ohne Premium-Rhythmus** (zu kleine Headlines, wenig Weißraum, kein klares Maßsystem).

## 3. Neue Informationsarchitektur

App-Shell mit **5 klaren Zielen** (mobil Bottom-Tabbar, Desktop Topbar):

```
Start (Discover)   → funktionaler Hero (Suche) + Kategorien + Feed in der Nähe
Karte (Browse)     → Liste + Karte, Filter, Standort/Umkreis
+ Auftrag          → mehrstufiger Einstell-Flow (zentrale Aktion, hervorgehoben)
Chats              → Nachrichten/Bewerbungen
Profil             → eigenes Profil, Vertrauen, Einstellungen
```

Sekundäre Tiefe: **Auftragsdetail** (aus Feed/Karte), **öffentliches Profil** (aus Detail),
**Auth** (aus jeder geschützten Aktion). Jede Sackgasse vermieden — jede Karte führt zu Detail,
jedes Detail zu Profil & Aktion.

**3-Sekunden-Test gelöst:** Hero-Headline sagt *was* („Hilfe in deiner Nähe"), die Suchleiste
zeigt *was man tun kann*, die Trust-Zeile (12.400+ Aufträge, 4,9★, verifiziert) sagt *warum
vertrauen*, die beiden CTAs („Aufträge finden" / „Auftrag erstellen") sind *der nächste Schritt*.

## 4. Neues Layout (pro Screen, begründet)

- **Discover:** Hero mit großer Typo + **funktionaler Such-Panel** (Aufgabe · Ort · Kategorie · Go), darunter Trust-Zeile → Kategorie-Rail → „Aufträge in deiner Nähe"-Feed. *Begründung:* höchste Kaufabsicht sofort bedienen; Social Proof direkt am Einstieg.
- **Browse/Karte:** zweispaltig (Liste 1fr / sticky Karte 1fr); mobil Karte oben kompakt, Liste darunter. *Begründung:* räumliches Verständnis ohne Scroll-Falle (Karte sticky, Liste scrollt).
- **Detail:** Inhalt + sticky Aktions-Panel (Preis, Bewerben, Merken, Helferprofil, Sicherheit); mobil fixe Action-Dock unten. *Begründung:* Entscheidung & Aktion immer sichtbar.
- **Profil:** Identität + 4 Kennzahlen (Aufträge, Ø-Bewertung, Abschlussquote, Antwortzeit) + Bewertungen. *Begründung:* Vertrauen quantifiziert.
- **Post:** 4 ruhige Schritte mit Fortschritt + Vorschau vor Bezahlung. *Begründung:* weniger Abbrüche, klare Erwartung (inkl. 2 € Inseratsgebühr transparent).
- **Auth:** fokussierter, minimaler Flow (Segment-Switch Anmelden/Registrieren).

## 5. Neue Komponentenstruktur

`AppShell` (Topbar/Tabbar) · `SearchPanel` · `CategoryRail`/`CategoryCard` · **`JobCard`** (Premium)
· `JobDetail` + `ActionDock` · `TrustPanel` (Rating/Verifizierung/Aktivität/Sicherheit) ·
`ProfileHeader` + `StatGrid` + `ReviewItem` · `Stepper` + `Field`/`Choice` (Post) · `SegmentedControl` (Auth)
· `Skeleton` · `Toast` · `Chip`/`Tag`/`Button`. Jede Komponente nutzt ausschließlich Tokens (s. u.).

## 6. Designsystem (Tokens)

Spacing-Basis 4 px: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 46 · 64 · 96`.
Radien: `10 / 14 / 20 / 28 / pill`. Schatten **weich & warm, niedrig**:

```
--sh-1: 0 1px 2px rgba(26,23,20,.04), 0 1px 3px rgba(26,23,20,.03)
--sh-2: 0 6px 20px rgba(26,23,20,.06), 0 1px 4px rgba(26,23,20,.04)
--sh-3: 0 18px 48px rgba(26,23,20,.12), 0 4px 12px rgba(26,23,20,.06)
```

Motion-Tokens: `--ease: cubic-bezier(.22,.61,.36,1)`, Dauer 150 ms (Micro) / 250–420 ms (Reveal/Transition).

## 7. Neue Farbpalette (Warm-Premium)

| Token | Hex | Einsatz |
|---|---|---|
| `--bg` | `#FBF9F5` | Warm Ivory – Haupt-Hintergrund |
| `--bg-2` | `#F4EFE7` | Light Sand – sekundäre Flächen |
| `--bg-3` | `#ECE5D8` | Soft Beige – subtile Flächen |
| `--card` | `#FFFFFF` | Karten |
| `--ink` | `#1A1714` | warmes Near-Black – Primärtext & Primär-Button |
| `--ink-2` | `#544D44` | Anthrazit – Sekundärtext |
| `--muted` | `#8C8377` | Tertiärtext |
| `--line` | `#EAE3D6` | warme Haarlinie |
| `--gold` | `#B08D4F` | Champagner-Gold – Akzent, Premium, Verifizierung |
| `--gold-soft` | `#F0E8D6` | Gold-Tint Flächen |
| `--sage` | `#5E7A63` | gedämpftes Naturgrün – „verifiziert/aktiv" |

Prinzip: **eine** ruhige Hintergrundwelt, Schwarz als Aktionsfarbe, Gold nur als seltener
Veredelungs-Akzent. Keine Verläufe außer extrem dezenten Radials im Hero.

## 8. Typografie

System-Stack (`-apple-system, "SF Pro Display", Inter, …`) — kein externer Font-Request
(Performance + DSGVO). Skala mit `clamp()` für fluide Größen:

```
display  clamp(40,6.4vw,68)  / 1.02 / 760 / -0.035em
h1       clamp(30,4.4vw,44)  / 1.06 / 740 / -0.030em
h2       clamp(23,3vw,30)    / 1.12 / 720 / -0.022em
h3       19 / 680            body 17/1.62 (ink-2)   small 14   micro 12.5
```

Viel Weißraum, tabellarische Ziffern bei Preisen (`font-variant-numeric:tabular-nums`).

## 9. Animationen

- **Scroll-Reveal:** `opacity 0→1 + translateY(18px→0)` via IntersectionObserver (nur einmal, dann unobserve).
- **Micro-Interactions:** Buttons `scale(.97)` beim Druck; Karten `translateY(-4px)` + `--sh-3` beim Hover; Icon-Buttons heben leicht.
- **Smart Loading:** Skeleton-Shimmer (200 % Gradient) vor dem Feed-Render.
- **View-Transitions:** weiches `viewIn` (opacity+translateY) beim Screen-Wechsel.
- **Floating:** dezente `floaty`-Animation für Akzentobjekte.
- Alles **nur `transform`/`opacity`** → GPU-beschleunigt, 60 fps. `prefers-reduced-motion` wird respektiert (alle Animationen aus).

## 10. Mobile-App-Architektur

- **App-Shell + Tab-Routing:** Views sind eigenständige „Screens", die per `go(view)` ein-/ausgeblendet werden — 1:1 als native Screens (iOS/Android) bzw. PWA übernehmbar.
- **Bottom-Tabbar** (Start/Karte/+Auftrag/Chats/Profil) mit hervorgehobener zentraler Aktion = Standard nativer Marktplatz-Apps.
- **Sticky Action-Dock** im Detail = native „bottom action bar".
- **Safe-Areas** via `env(safe-area-inset-*)`; `viewport-fit=cover`; 16 px Inputs (kein iOS-Zoom); Touch-Targets ≥ 44–48 px.
- **Datenfluss-Trennung:** UI-Layer ist von der Datenlogik entkoppelt (Render-Funktionen + Mock-Daten im Prototyp) — bei Migration werden nur die Datenquellen (Supabase) eingehängt, das UI bleibt.

## 11. Konkrete Implementierungs-/Migrationsanweisungen (Phasen)

Empfohlene, risikoarme Reihenfolge in die **Produktion** (`index.html`), je Phase testen:

1. **Foundation:** Neues Token-Set in `:root` einsetzen (Farben/Typo/Schatten/Radii/Motion). Alte Variablen (`--c-*`) per Alias auf neue Tokens mappen (siehe 12) → sofortiger Premium-Look, minimales Risiko.
2. **App-Shell:** Topbar schlanker + funktionale Suchleiste; bestehende Bottom-Nav auf neuen Tabbar-Stil heben.
3. **Hero → funktional:** Such-Panel (Aufgabe/Ort/Kategorie) statt Radar-Deko; CTAs „Finden/Erstellen".
4. **JobCard:** Premium-Karte (s. Prototyp) in `renderJobCards()` übernehmen — gleiche Daten, neues Markup/CSS.
5. **Detail + Vertrauen:** Sticky Action-Panel/Dock + TrustPanel; bestehende Bewerbungs-/Bewertungslogik bleibt.
6. **Post & Auth:** bestehende Flows in den ruhigen Stepper-/Panel-Stil überführen (Logik unverändert).
7. **Motion:** Reveal/Skeleton/Micro-Interactions ergänzen.

Auth/Supabase/Stripe/Chat/Bewertungen/Push: **nur Markup/CSS-Hülle** ändern, Funktions-Hooks
(IDs, Event-Handler, `SR.*`-Aufrufe) beibehalten.

## 12. Exakte Code-Änderungen (Token-Mapping)

Beim Migrieren in `index.html` die bestehenden Variablen auf die neue Welt mappen
(als Aliasse in `:root`, damit nichts bricht):

```css
/* ALT (heute)            →  NEU (Premium-Welt) */
--c-bg:   #ffffff;        →  var(--card)        /* Karten bleiben weiß */
--c-bg1:  #f6f8fa;        →  #F4EFE7            /* Light Sand */
--c-bg2:  #eaeef2;        →  #ECE5D8            /* Soft Beige */
--c-ink:  #0f1117;        →  #1A1714            /* warmes Near-Black */
--c-ink2: #2d333b;        →  #544D44
--c-ink3: #586069;        →  #8C8377
--c-bd:   #d0d7de;        →  #EAE3D6            /* warme Haarlinie */
--c-blue: #0969da;        →  #1A1714            /* Primäraktion = Schwarz */
--c-green:#1a7f37;        →  #5E7A63            /* gedämpftes Sage */
/* NEU ergänzen */         --gold:#B08D4F; --gold-soft:#F0E8D6;
/* Schatten --sh1..4 → weiche Werte aus Punkt 6; Body-Hintergrund auf var(--bg) (#FBF9F5) */
```

Konkrete Stellen in `index.html`: `:root`-Block (Tokens), `body{background}`,
`.btn-primary`/`.btn-green` (→ schwarz/sage), `.jcard*` (→ `JobCard`-Markup aus Prototyp),
`nav`/`.mobile-bottomnav` (→ App-Shell/Tabbar-Stil), `.hero` (→ funktionaler Such-Hero).
Das Token-Aliasing in Phase 1 reskinnt **die ganze App auf einmal**, ohne Komponenten-Logik zu berühren.

---

### Prototyp
`redesign/index.html` — selbst-enthalten, ohne externe Abhängigkeiten (Lighthouse-/offline-freundlich),
responsiv (Desktop/Tablet/Mobile), mit allen Screens, Motion, Skeletons und Mock-Daten.
Optional unter `/redesign` deploybar (per vorhandener `vercel.json`), um die Richtung live zu zeigen,
bevor wir in die Produktion migrieren.
