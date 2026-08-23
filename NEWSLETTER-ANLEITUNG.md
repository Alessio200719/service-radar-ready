# Newsletter – so funktioniert er

## Was automatisch läuft

1. Jemand trägt seine Adresse im Footer oder auf einer Blog-Seite ein
2. Er erhält eine Bestätigungsmail (Double-Opt-in, in Deutschland Pflicht)
3. Erst nach dem Klick auf den Link gilt die Anmeldung
4. Die Adresse steht dann mit `confirmed = true` in `newsletter_subscribers`

**Abmelden** geht auf zwei Wegen:
- über den Link am Ende jeder E-Mail
- über „Newsletter abbestellen" im Footer der Website

Abgemeldete bleiben als Nachweis in der Tabelle, aber mit gesetztem `unsubscribed_at`.

---

## Empfänger abrufen

Im Supabase SQL Editor:

```sql
select email
from public.newsletter_subscribers
where confirmed = true and unsubscribed_at is null
order by confirmed_at desc;
```

Über **Export** oben rechts als CSV herunterladen.

Anzahl der aktiven Abonnenten:

```sql
select count(*) from public.newsletter_subscribers
where confirmed = true and unsubscribed_at is null;
```

---

## Newsletter verschicken (über Resend)

1. Bei Resend auf **Audiences** → **Create Audience**, z. B. „Service Radar Newsletter"
2. Die CSV aus Supabase importieren
3. Auf **Broadcasts** → **Create Broadcast**
4. Betreff und Text schreiben, Audience auswählen, senden

Resend fügt automatisch einen Abmeldelink ein und verwaltet Abmeldungen.
Wichtig: Wer sich dort abmeldet, steht weiterhin in deiner Supabase-Tabelle.
Gleiche die Listen daher vor jedem Versand ab — oder verschicke immer an eine
frisch exportierte Liste, dann kann das nicht auseinanderlaufen.

---

## Eigenen Abmeldelink einbauen

Wenn du selbst eine Mail baust, gehört ans Ende:

```
https://service-radar.com/api/newsletter-unsubscribe?token=<TOKEN>
```

Das `token` steht in der Tabelle in der Spalte `token` — pro Empfänger individuell.

---

## Rechtlicher Rahmen (Deutschland)

- Double-Opt-in ist Pflicht — ist eingebaut
- Abmeldelink in jeder Mail ist Pflicht — ist eingebaut
- Impressum in jeder Mail: Name, Anschrift, Kontakt. Trag das in deine
  Newsletter-Vorlage bei Resend ein.
- Keine Werbemails an Adressen ohne bestätigte Anmeldung.
