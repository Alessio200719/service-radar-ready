# Service Radar – Deploy (jetzt super einfach)

## TL;DR
**Du musst nur die neue `index.html` deployen.** Sonst nichts. Karte und Rechtstexte
funktionieren jetzt ohne den `assets/`-Ordner.

---

## Warum es jetzt einfach ist
Deine Konsole zeigte: `index.html`, `config.js`, `supabase.js` laden bereits korrekt
(„[SR] Supabase client initialised"). Nur der `assets/`-Unterordner war 404. Deshalb ist
die Seite jetzt so umgebaut, dass sie **nichts mehr aus `assets/` braucht**:

- **Karte:** Leaflet (Skript + Stylesheet) kommt vom CDN (jsDelivr). Kein lokaler Ordner nötig.
- **Rechtstexte (Impressum, AGB, Datenschutz, Nutzungsbedingungen, Cookie-Richtlinie):**
  sind jetzt **vollständig als HTML in der `index.html` eingebettet**. Kein PDF, keine
  externe Datei. Über „🖨️ Drucken / als PDF speichern" kann sich jeder die Dokumente
  direkt im Browser als PDF sichern.

Damit sind die einzigen nötigen Dateien: **`index.html`, `config.js`, `supabase.js`** –
und die werden bei dir ja schon ausgeliefert.

---

## Schritte
1. Die neue **`index.html`** in dein Repo übernehmen (die anderen beiden Dateien sind schon online).
2. Push → Vercel deployt automatisch.
3. Seite mit **Cmd+Shift+R** (Hard-Reload) öffnen.

## Kurz prüfen
In der Browser-Konsole sollte stehen:
- `[SR MAP] leaflet lib: 1.9.4` → Karte aktiv
- `[SR MAP] boxes: … #jobMap off=…x…` → Container > 0
- **keine** `404`-Zeilen mehr (auch nicht für `assets/vendor/leaflet.js`)

Karte füllt die linke Fläche, Footer-Links (Impressum/AGB/…) öffnen die Texte direkt
auf der Seite. ✅

---

## Optional (nur falls du später willst)
Den `assets/`-Ordner brauchst du **nicht** mehr. Wenn du ihn trotzdem online haben willst
(z. B. eigene Offline-Kopie von Leaflet oder die ursprünglichen PDFs), lade den kompletten
`assets/`-Ordner per GitHub-Upload oder `git add assets` mit hoch. Für den Betrieb ist das
aber nicht erforderlich.
