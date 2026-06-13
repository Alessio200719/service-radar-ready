-- ============================================================================
-- Service Radar – Profil-Upgrade: Profilfelder, Bewertungen, Avatar-Storage
-- ============================================================================
-- EINMALIG im Supabase SQL-Editor ausführen. Idempotent & sicher wiederholbar.
-- Baut auf der bestehenden profiles/jobs-Struktur auf (siehe supabase_schema.sql).
-- ============================================================================

-- 1) PROFILES erweitern (rating + avatar_url existieren bereits) -------------
alter table public.profiles add column if not exists bio            text;
alter table public.profiles add column if not exists review_count   integer     default 0;
alter table public.profiles add column if not exists response_rate  numeric;
alter table public.profiles add column if not exists response_time  text;
alter table public.profiles add column if not exists phone_verified  boolean    default false;
alter table public.profiles add column if not exists email_verified  boolean    default false;
alter table public.profiles add column if not exists stripe_verified boolean    default false;

-- Jeder darf öffentliche Profile lesen (Policy existiert evtl. schon)
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);

-- 2) REVIEWS (Bewertungen) ---------------------------------------------------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references public.jobs(id)     on delete set null,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  unique (job_id, reviewer_id, reviewee_id)
);
create index if not exists reviews_reviewee_idx on public.reviews(reviewee_id);
create index if not exists reviews_reviewer_idx on public.reviews(reviewer_id);

alter table public.reviews enable row level security;
-- Bewertungen sind öffentlich lesbar (Vertrauen auf Profilseite)
drop policy if exists "reviews_select_all" on public.reviews;
create policy "reviews_select_all" on public.reviews for select using (true);
-- Nur eingeloggte Nutzer können EIGENE Bewertungen anlegen (nicht sich selbst)
drop policy if exists "reviews_insert_self" on public.reviews;
create policy "reviews_insert_self" on public.reviews for insert
  with check (auth.uid() = reviewer_id and reviewer_id <> reviewee_id);
-- Eigene Bewertung ändern/löschen
drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews for update
  using (auth.uid() = reviewer_id) with check (auth.uid() = reviewer_id);
drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews for delete using (auth.uid() = reviewer_id);

-- 3) TRIGGER: profiles.rating + review_count automatisch aktuell halten ------
create or replace function public.refresh_profile_rating()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare target uuid;
begin
  target := coalesce(new.reviewee_id, old.reviewee_id);
  update public.profiles p set
    rating       = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where reviewee_id = target), 0),
    review_count = (select count(*) from public.reviews where reviewee_id = target)
  where p.id = target;
  return null;
end;
$$;

drop trigger if exists on_review_change on public.reviews;
create trigger on_review_change
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_profile_rating();

-- 3b) Öffentliche Profil-Statistik (zählt auch NICHT-öffentliche/abgeschlossene
--     Aufträge korrekt – SECURITY DEFINER umgeht RLS nur für diese Zählung).
create or replace function public.public_profile_stats(uid uuid)
returns table (created_jobs bigint, completed_jobs bigint)
language sql security definer set search_path = public stable
as $$
  select count(*)::bigint,
         count(*) filter (where status = 'closed')::bigint
  from public.jobs where user_id = uid;
$$;
grant execute on function public.public_profile_stats(uuid) to anon, authenticated;

-- ============================================================================
-- 4) AVATAR-STORAGE  (Bucket "avatars")
-- ============================================================================
-- a) Bucket anlegen (öffentlich lesbar). Falls schon vorhanden -> ignoriert.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- b) Policies: jeder darf Avatare LESEN; eingeloggte Nutzer dürfen NUR im
--    eigenen Ordner ( {user-id}/... ) schreiben/ändern/löschen.
drop policy if exists "avatars_public_read"   on storage.objects;
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- FERTIG.
--   profiles: + bio, review_count, response_rate/-time, *_verified
--   reviews:  Bewertungen 1–5 + Kommentar, RLS, Auto-Aggregat-Trigger
--   storage:  Bucket "avatars" (public read, eigener Ordner schreibbar)
--   created_jobs / completed_jobs werden LIVE aus der jobs-Tabelle gezählt
--   (kein Denormalisieren nötig) – siehe supabase.js getPublicProfile().
-- ============================================================================
