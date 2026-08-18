# Service Radar – E-Mail-Vorlagen für Supabase

Einfügen unter: Supabase → Authentication → Emails → jeweilige Vorlage.
Die Platzhalter `{{ .ConfirmationURL }}` usw. bitte unverändert lassen.

---

## 1. Confirm signup (Registrierung bestätigen)

**Betreff:** Bestätige deine Anmeldung bei Service Radar

```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0d1117">
  <h2 style="font-size:20px;font-weight:600;margin:0 0 12px">Willkommen bei Service Radar</h2>
  <p style="font-size:15px;line-height:1.6;color:#3d444d;margin:0 0 20px">
    Nur noch ein Schritt: Bestätige deine E-Mail-Adresse, dann kannst du Aufträge finden oder selbst einstellen.
  </p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0d1117;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-size:15px;font-weight:600">E-Mail bestätigen</a>
  </p>
  <p style="font-size:13px;line-height:1.6;color:#57606a;margin:0 0 6px">
    Falls der Knopf nicht funktioniert, kopiere diesen Link in deinen Browser:
  </p>
  <p style="font-size:12px;color:#57606a;word-break:break-all;margin:0 0 24px">{{ .ConfirmationURL }}</p>
  <p style="font-size:12.5px;color:#8b949e;border-top:1px solid #d0d7de;padding-top:14px;margin:0">
    Du hast dich nicht bei Service Radar registriert? Dann ignoriere diese E-Mail einfach.
  </p>
</div>
```

---

## 2. Reset password (Passwort zurücksetzen)

**Betreff:** Neues Passwort für Service Radar

```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0d1117">
  <h2 style="font-size:20px;font-weight:600;margin:0 0 12px">Passwort zurücksetzen</h2>
  <p style="font-size:15px;line-height:1.6;color:#3d444d;margin:0 0 20px">
    Du hast ein neues Passwort für dein Service-Radar-Konto angefordert. Der Link ist eine Stunde gültig.
  </p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0d1117;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-size:15px;font-weight:600">Neues Passwort vergeben</a>
  </p>
  <p style="font-size:13px;line-height:1.6;color:#57606a;margin:0 0 6px">
    Falls der Knopf nicht funktioniert, kopiere diesen Link in deinen Browser:
  </p>
  <p style="font-size:12px;color:#57606a;word-break:break-all;margin:0 0 24px">{{ .ConfirmationURL }}</p>
  <p style="font-size:12.5px;color:#8b949e;border-top:1px solid #d0d7de;padding-top:14px;margin:0">
    Du hast das nicht angefordert? Dann ignoriere diese E-Mail – dein Passwort bleibt unverändert.
  </p>
</div>
```

---

## 3. Change email address (E-Mail-Adresse ändern)

**Betreff:** Bestätige deine neue E-Mail-Adresse

```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0d1117">
  <h2 style="font-size:20px;font-weight:600;margin:0 0 12px">Neue E-Mail-Adresse bestätigen</h2>
  <p style="font-size:15px;line-height:1.6;color:#3d444d;margin:0 0 20px">
    Bestätige diese Adresse, damit sie künftig für dein Service-Radar-Konto gilt.
  </p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0d1117;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-size:15px;font-weight:600">Adresse bestätigen</a>
  </p>
  <p style="font-size:12.5px;color:#8b949e;border-top:1px solid #d0d7de;padding-top:14px;margin:0">
    Du hast keine Änderung angefordert? Dann ignoriere diese E-Mail.
  </p>
</div>
```

---

## Wichtig: Redirect-URL freigeben

Damit die Links funktionieren, unter **Authentication → URL Configuration** eintragen:

- **Site URL:** `https://service-radar.com`
- **Redirect URLs:** `https://service-radar.com/**`
