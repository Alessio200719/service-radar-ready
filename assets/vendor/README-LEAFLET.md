# Karten-Bibliothek (lokal, kein CDN)

`leaflet.js` in diesem Ordner ist eine **eigenständige, schlanke Karten-Bibliothek**
für Service Radar. Sie implementiert genau die benötigte API (Karte, Tiles, Marker,
Radius-Kreis, Pan/Zoom) und lädt **kein externes Leaflet-CDN**.

- `leaflet.js`  – die lokale Karten-Lib (wird von index.html zuerst geladen)
- `leaflet.css` – Basis-Styles (Rundungen etc.)

## Verhalten
- Lokale Datei vorhanden → sie wird benutzt, **kein CDN**.
- Lokale Datei fehlt → Notfall-Fallback: offizielles Leaflet vom CDN, sonst statische
  OpenStreetMap-Karte (iframe).

## Optional: das „echte" Leaflet verwenden
Wer lieber das offizielle Leaflet (1.9.4) lokal hosten möchte, lädt es einmal herunter
und überschreibt diese Datei:

    curl -L https://unpkg.com/leaflet@1.9.4/dist/leaflet.js -o assets/vendor/leaflet.js
    curl -L https://unpkg.com/leaflet@1.9.4/dist/leaflet.css -o assets/vendor/leaflet.css

> Hinweis: Die Karten-Tiles (OpenStreetMap) sind in der Datenschutz-/Cookie-Richtlinie genannt.
