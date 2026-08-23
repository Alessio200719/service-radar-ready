# Vercel: höchstens 12 Serverless Functions (kostenloser Tarif)

## Was war das Problem

Der Hobby-Plan erlaubt maximal 12 Funktionen im Ordner `api/`. Das Projekt hatte
15 – deshalb schlug jedes vollständige Deployment fehl:

> No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.

## Was ich geändert habe

Sechs Dateien wurden zu zwei zusammengefasst:

| vorher | jetzt |
|---|---|
| newsletter-subscribe.js, newsletter-confirm.js, newsletter-unsubscribe.js | **newsletter.js** |
| vapid-public-key.js, save-push-subscription.js, send-push-notification.js | **push.js** |

Damit sind es **11 von 12** – eine Reserve bleibt.

**Für die Website ändert sich nichts.** Die alten Adressen funktionieren weiter,
weil `vercel.json` sie umleitet:

```
/api/newsletter-subscribe    -> /api/newsletter?action=subscribe
/api/newsletter-confirm      -> /api/newsletter?action=confirm
/api/newsletter-unsubscribe  -> /api/newsletter?action=unsubscribe
/api/vapid-public-key        -> /api/push?action=vapid
/api/save-push-subscription  -> /api/push?action=save
/api/send-push-notification  -> /api/push?action=send
```

## Wichtig beim Hochladen

Die sechs alten Dateien müssen im Repository **gelöscht** werden. Bleiben sie
liegen, zählt Vercel wieder 17 Funktionen und das Deployment scheitert erneut.

Zu löschen im Ordner `api`:

- newsletter-subscribe.js
- newsletter-confirm.js
- newsletter-unsubscribe.js
- vapid-public-key.js
- save-push-subscription.js
- send-push-notification.js

Auf github.com: Datei anklicken → Papierkorb-Symbol oben rechts → Commit.

## Falls du später neue Funktionen brauchst

Entweder wieder zusammenfassen (mehrere Aufgaben in einer Datei mit `?action=`),
oder auf den Pro-Plan wechseln. Dateien, die mit `_` beginnen, zählen nicht mit –
sie sind reine Hilfsdateien und werden nicht als eigene Adresse veröffentlicht.
