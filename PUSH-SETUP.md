# Service Radar – Web Push (Browser-Benachrichtigungen)

Echte Web-Push-Notifications über **Service Worker + VAPID + web-push** (kein Fake,
kein localStorage). Empfänger werden bei neuer Nachricht, Bewerbung, Bewertung und
Auftragsabschluss benachrichtigt.

## Geänderte / neue Dateien
- `sw.js` **(NEU, Root)** – Service Worker: `push`-Event → Notification; Klick → Tab öffnen/fokussieren.
- `icon-192.png` **(NEU)** – Notification-Icon.
- `supabase_push.sql` **(NEU)** – Tabelle `push_subscriptions` + RLS.
- `api/save-push-subscription.js` **(NEU)** – speichert Subscription (Service-Role).
- `api/send-push-notification.js` **(NEU)** – sendet Push via web-push (Service-Role).
- `api/vapid-public-key.js` **(NEU)** – liefert den ÖFFENTLICHEN VAPID-Key ans Frontend.
- `package.json` – Dependency `web-push`.
- `index.html` – SW-Registrierung, „🔔 Benachrichtigungen aktivieren" im Profil, Status,
  Subscribe-Flow, `notifyUser`-Trigger an den Events.
- `.env.example` – VAPID + Supabase-Service-Vars dokumentiert.

## Neue Datenbank
`public.push_subscriptions` (id, user_id→profiles, endpoint UNIQUE, subscription jsonb,
created_at) mit RLS: jeder Nutzer sieht/speichert/aktualisiert/löscht **nur die eigene**
Subscription.

## Neue API-Routes
- `POST /api/save-push-subscription` – Body `{ user_id, subscription }` → Upsert (onConflict endpoint).
- `POST /api/send-push-notification` – Body `{ user_id, title, body, url }` → Push an alle Subs des Nutzers.
- `GET  /api/vapid-public-key` – `{ publicKey }`.

## Neue Environment Variables (Vercel → Settings → Environment Variables)
| Variable | Wo | Zweck |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Server (+ via Route ans Frontend) | Push-Identität (öffentlich) |
| `VAPID_PRIVATE_KEY` | **nur Server** | Signiert Pushes – NIE ins Frontend |
| `VAPID_SUBJECT` | Server | z. B. `mailto:info@service-radar.com` |
| `SUPABASE_URL` | Server | Subscriptions lesen/schreiben |
| `SUPABASE_SERVICE_ROLE_KEY` | **nur Server** | RLS-Bypass für die Routes – NIE ins Frontend |

## VAPID-Keys generieren
```bash
npx web-push generate-vapid-keys
```
Gibt `Public Key` und `Private Key` aus → in Vercel als `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` eintragen, dazu `VAPID_SUBJECT=mailto:info@service-radar.com`.

## Setup-Schritte
1. **SQL:** `supabase_push.sql` im Supabase SQL-Editor ausführen.
2. **VAPID-Keys** generieren und alle 5 ENV-Variablen in Vercel setzen → **Redeploy**.
3. **Deployen:** `sw.js`, `icon-192.png`, der `api/`-Ordner, neue `index.html`, `supabase.js`,
   `package.json` (Vercel installiert `web-push` automatisch). Service Worker funktioniert
   nur über **HTTPS** (Vercel) – nicht über `file://`.

## Testanleitung
1. Seite öffnen (HTTPS), **einloggen** → Profil → **🔔 Aktivieren** → im Browser „Erlauben".
2. **Subscription-Nachweis:** Supabase → Table `push_subscriptions` → es erscheint eine Zeile
   mit deiner `user_id` und `endpoint`. (In der Konsole: keine `Push subscription error`.)
3. **Test-Push (direkt):** im Terminal
   ```bash
   curl -X POST https://service-radar.com/api/send-push-notification \
     -H "Content-Type: application/json" \
     -d '{"user_id":"<DEINE-USER-UUID>","title":"Test","body":"Push funktioniert 🎉"}'
   ```
   → Antwort `{"sent":1,...}` und die Benachrichtigung erscheint.
4. **Echte Events:** mit einem zweiten Konto eine Chat-Nachricht / Bewerbung schicken →
   das erste Konto bekennt den Push.

> Browser-Hinweis: Chrome/Edge/Firefox (Desktop & Android) voll unterstützt. Safari/iOS
> ab macOS 13 / iOS 16.4 (iOS nur als zum Homescreen hinzugefügte PWA).

## Fehler-Logging
- Frontend: `console.error("Push subscription error:", e)` / `console.error("Push send error:", e)` + Toast.
- API: `console.error("Push subscription error:", error)` / `console.error("Push send error:", error)` (Vercel-Logs).

## Sicherheit
`VAPID_PRIVATE_KEY` und `SUPABASE_SERVICE_ROLE_KEY` liegen ausschließlich serverseitig in
Vercel. Das Frontend nutzt nur `VAPID_PUBLIC_KEY` (über `/api/vapid-public-key`).
