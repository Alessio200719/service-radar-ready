# Service Radar – Deploy & Stripe-Setup

## Was jetzt deployt werden muss
Seit der echten Stripe-Integration gehören **zusätzlich** zum Repo:

```
service-radar/
├─ index.html
├─ config.js
├─ supabase.js
├─ package.json          ← NEU (lässt Vercel "stripe" installieren)
└─ api/                  ← NEU (Vercel Serverless Functions)
   ├─ create-checkout-session.js
   ├─ verify-checkout-session.js
   └─ stripe-webhook.js  (optional)
```

> Wichtig: `package.json` und der ganze `api/`-Ordner **müssen** mit ins Repo /
> Deployment. (Der `assets/`-Ordner bleibt optional – Karte & Rechtstexte brauchen ihn nicht.)

Vercel-Einstellungen: **Framework Preset „Other"**, **kein Build Command**,
Output `.`. Vercel erkennt `/api/*.js` automatisch als Functions und installiert
die Abhängigkeiten aus `package.json`.

---

## Stripe einrichten (einmalig)
1. **Stripe-Konto** → Dashboard.
2. **API-Keys** holen: Developers → API keys.
   - Secret Key (`sk_live_…` bzw. zum Testen `sk_test_…`).
3. In **Vercel → Project → Settings → Environment Variables** eintragen:
   - `STRIPE_SECRET_KEY` = dein Secret Key  ← **nur hier, niemals im Frontend!**
   - (optional) `SITE_URL` = `https://service-radar.com`
4. **Redeploy** (Vercel → Deployments → Redeploy), damit die Variablen aktiv werden.

Das war's für die Zahlung. Der Publishable Key wird in diesem Ablauf (gehosteter
Stripe-Checkout per Weiterleitung) **nicht** im Frontend benötigt.

### Optional: Webhook (zusätzliche Absicherung)
Nur falls gewünscht (der Auftrag wird auch ohne Webhook nach bestätigter Zahlung
veröffentlicht):
1. Stripe → Developers → **Webhooks** → Endpoint `https://service-radar.com/api/stripe-webhook`,
   Event **`checkout.session.completed`**.
2. ENV setzen: `STRIPE_WEBHOOK_SECRET=whsec_…` (und für serverseitiges Veröffentlichen
   zusätzlich `PUBLISH_VIA_WEBHOOK=true`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

---

## Ablauf (so funktioniert es jetzt)
1. Auftraggeber füllt den Auftrag aus.
2. Letzter Schritt **veröffentlicht NICHT** – Klick auf „🔒 Jetzt 2,00 € bezahlen"
   leitet zur **gehosteten Stripe-Bezahlseite** weiter (Produkt „Service Radar
   Inseratsgebühr", 2,00 €).
3. **Zahlung erfolgreich** → Rückkehr auf `…/?sr_pay=success` → der Server bestätigt
   per `/api/verify-checkout-session`, dass wirklich bezahlt wurde → **erst dann**
   wird der Auftrag in Supabase als `active` gespeichert und erscheint live.
4. **Zahlung abgebrochen** → Rückkehr auf `…/?sr_pay=cancel` → Meldung
   „Zahlung abgebrochen", **kein** Auftrag wird veröffentlicht.

Kein Demo-Modus, kein Fake-Payment, kein Auftrag ohne Zahlung.

---

## Test
- **Stripe-Testmodus:** `sk_test_…` als `STRIPE_SECRET_KEY`. Testkarte **4242 4242
  4242 4242**, beliebiges zukünftiges Datum, beliebige CVC/PLZ.
- Auftrag ausfüllen → bezahlen → nach „erfolgreich" erscheint der Auftrag auf Karte/Liste.
- Test „Abbrechen" in Stripe → zurück auf die Seite, Meldung „Zahlung abgebrochen", kein Auftrag.
- Konsole: keine `404`, `[SR MAP] leaflet lib: 1.9.4`.

> Erst wenn alles im Testmodus klappt, auf `sk_live_…` umstellen (echtes Geld!).
