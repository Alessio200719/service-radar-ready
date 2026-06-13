# Service Radar – Profil- & Bewertungssystem (Setup)

## Was neu ist
Ein echtes, öffentliches Profilsystem mit Profilbildern (Supabase Storage),
Bewertungen (Supabase) und Vertrauenselementen – überall klickbar.
Alle Daten kommen aus **echten Supabase-Daten** (keine Fake-/Demo-Inhalte).

## Geänderte / neue Dateien
- `supabase_profiles_reviews.sql` **(NEU – einmal ausführen)** – Profilfelder,
  `reviews`-Tabelle + RLS + Aggregat-Trigger, Statistik-Funktion, Avatar-Bucket.
- `supabase.js` – neue API: `getPublicProfile`, `updateProfile`, `uploadAvatar`,
  `createReview`, `listReviews`; Profil-Joins liefern jetzt `avatar_url` + `rating`.
- `index.html` – Avatar-Komponente überall, öffentliches Profil-Modal, Avatar-Upload
  mit Komprimierung, Bewertungsfluss, Hash-Routing, Verifizierungs-Badges.

## Architektur (Datenfluss)
```
profiles (id, full_name, avatar_url, rating, review_count, bio,
          email_verified, stripe_verified, phone_verified, city, created_at)
   ▲ rating/review_count  ← Trigger refresh_profile_rating()
reviews (job_id, reviewer_id, reviewee_id, rating 1–5, comment, created_at)
jobs.user_id → profiles.id   (Joins liefern Poster-Avatar + Rating)
Storage-Bucket "avatars"  →  profiles.avatar_url
```
- Avatare werden client-seitig auf max. 512 px / JPEG q0.85 **komprimiert** (Canvas),
  dann nach `avatars/{userId}/avatar_*.jpg` hochgeladen; die Public-URL landet in
  `profiles.avatar_url`.
- `getPublicProfile()` liefert Profil + Live-Statistik (erstellte/abgeschlossene
  Aufträge über die SECURITY-DEFINER-Funktion `public_profile_stats`, damit auch
  nicht-öffentliche/abgeschlossene Jobs korrekt gezählt werden).

## Neue Datenbankfelder (profiles)
`bio`, `review_count`, `response_rate`, `response_time`,
`email_verified`, `phone_verified`, `stripe_verified`
(`avatar_url`, `rating` existierten bereits).

## Neue Tabelle
`public.reviews` – RLS: öffentlich lesbar; Insert nur durch eingeloggten Bewerter
(`reviewer_id = auth.uid()`, nicht sich selbst); Trigger hält `profiles.rating` +
`review_count` automatisch aktuell.

## Storage-Struktur
Bucket **`avatars`** (public read). Schreiben/Ändern/Löschen nur im eigenen Ordner
`{user-id}/…` (Policies im SQL enthalten).

## Routen
Öffentliches Profil per Hash-Route: **`/#/profile/{userId}`**
(statische SPA → Hash-Routing, funktioniert ohne Server-Rewrites; beim Laden und bei
`hashchange` wird das Profil geöffnet). Klick auf Avatar/Name/Bewertung öffnet dasselbe Profil.

## Wo Avatare/Namen/Bewertungen jetzt erscheinen (alle klickbar → Profil)
- **Jobkarten** (rechte Liste): Avatar + Name + Bewertung des Auftraggebers.
- **Jobdetail**: Auftraggeber-Box mit Avatar, Name, echter Bewertung, „Profil ansehen".
- **Chat-Liste**: Avatar + Name (klickbar) + Bewertung.
- **Chat-Fenster**: Kopf-Avatar + Name (klickbar) + ★-Button „Bewerten".
- **Eigenes Profil**: Avatar + „Profilbild ändern" + Link zum eigenen öffentlichen Profil.
- **Öffentliches Profil**: Avatar, Name, Mitglied-seit, Ort, Bewertung+Anzahl,
  Verifizierungs-Badges, erstellte/abgeschlossene Aufträge, Bio, Bewertungsliste.

## Verifizierungs-Badges (echt)
- ✅ **E-Mail bestätigt** – gesetzt beim Login, wenn `email_confirmed_at` vorliegt.
- ✅ **Zahlung verifiziert** – gesetzt nach erfolgreicher Stripe-Zahlung.
- ✅ **Telefon bestätigt** – Feld vorhanden (Default false); Badge nur sichtbar, wenn true
  (kein Fake-Badge). Telefon-Verifizierung ist später nachrüstbar.

---

## EINMALIGES SETUP (nur du, in Supabase)
1. **SQL ausführen:** Supabase → SQL Editor → kompletten Inhalt von
   `supabase_profiles_reviews.sql` einfügen → **Run**.
   (Legt Felder, `reviews`, Trigger, Statistik-Funktion **und** den Bucket `avatars` an.)
2. **Prüfen:** Storage → es muss ein **öffentlicher** Bucket `avatars` existieren.
   (Falls nicht automatisch angelegt: Bucket `avatars` manuell als „Public" anlegen –
   die Policies aus dem SQL greifen dann.)
3. Neue **`index.html` + `supabase.js`** deployen.

## Testnachweis
**Offline (in dieser Lieferung verifiziert):**
- `node --check` für `index.html`-Skripte und `supabase.js` → fehlerfrei.
- Funktions-Tests mit dem **echten** extrahierten Code:
  - `avatarHtml` rendert gültiges `<img>` (mit Bild) bzw. Initialen-Kreis (ohne Bild),
    mit und ohne Klick-Ziel → korrektes, valides HTML.
  - `ratingHtml` → „Neu" bei 0, „★ 4.6 (12)" bei Werten.
  - `renderPublicProfile` → Name, Mitglied-seit, Ort, ★-Rating, Badges (E-Mail/Zahlung,
    Telefon korrekt ausgeblendet), Bio, Statistiken, Bewertungsliste mit Kommentaren.
  - Hash-Routing `#/profile/{id}` → öffnet das richtige Profil.

**Live (nach Setup-Schritt 1–3) zu prüfen:**
1. Profil öffnen → „Profilbild ändern" → Bild wählen → erscheint überall.
2. Auftrag öffnen → Auftraggeber-Avatar/Name klicken → öffentliches Profil öffnet.
3. Chat öffnen → ★ „Bewerten" → 1–5 Sterne + Kommentar → Bewertung erscheint im Profil,
   Durchschnitt + Anzahl aktualisieren sich automatisch (Trigger).
4. Konsole: keine Fehler.

> Hinweis: Ohne ausgeführtes SQL/Bucket bleibt die Seite stabil – Upload und Bewerten
> zeigen dann eine Fehlermeldung statt zu crashen, Profile zeigen „Neu"/0. Erst nach
> dem Setup sind Upload, Bewertungen und Statistiken vollständig aktiv.
