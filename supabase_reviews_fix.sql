-- ============================================================================
-- Service Radar – BEWERTUNGEN reparieren (reviews)  ·  IDEMPOTENT & SICHER
-- ----------------------------------------------------------------------------
-- Einmal im Supabase SQL-Editor ausführen. Mehrfaches Ausführen ist sicher.
-- Löscht KEINE Bewertungen/Daten. Legt fehlende Tabelle/Spalten/Constraints/
-- Policies/Trigger an und korrigiert sie.
-- Spaltenname: reviewee_id (= die in der Anforderung genannte "reviewed_user_id").
-- ============================================================================
create extension if not exists "pgcrypto";

-- 1) Tabelle + Spalten sicherstellen ----------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid()
);
alter table public.reviews add column if not exists job_id      uuid;
alter table public.reviews add column if not exists reviewer_id uuid;
alter table public.reviews add column if not exists reviewee_id uuid;
alter table public.reviews add column if not exists rating      integer;
alter table public.reviews add column if not exists comment     text;
alter table public.reviews add column if not exists created_at  timestamptz default now();

-- 2) Foreign Keys (drop+add, damit wiederholbar) ----------------------------
do $$ begin
  alter table public.reviews add constraint reviews_job_fk      foreign key (job_id)      references public.jobs(id)     on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.reviews add constraint reviews_reviewer_fk foreign key (reviewer_id) references public.profiles(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.reviews add constraint reviews_reviewee_fk foreign key (reviewee_id) references public.profiles(id) on delete cascade;
exception when duplicate_object then null; end $$;

alter table public.reviews drop constraint if exists reviews_rating_chk;
alter table public.reviews add  constraint reviews_rating_chk check (rating between 1 and 5);

-- 3) Kein Doppel-Review pro (Auftrag, Bewerter, Bewerteter) + Indexe --------
do $$ begin
  alter table public.reviews add constraint reviews_unique_pair unique (job_id, reviewer_id, reviewee_id);
exception when duplicate_table or duplicate_object then null; end $$;
create index if not exists reviews_reviewee_idx on public.reviews(reviewee_id);
create index if not exists reviews_reviewer_idx on public.reviews(reviewer_id);

-- 4) Beteiligungs-/Status-Prüfung (SECURITY DEFINER) ------------------------
--    Umgeht RLS NUR für diese Prüfung, damit AUCH der Helfer (der den
--    abgeschlossenen Job nicht sehen darf) bewerten kann. Prüft:
--      * Auftrag existiert UND ist abgeschlossen (status='closed')
--      * Bewerter und Bewerteter sind die beiden Beteiligten des Auftrags
--        (einer ist Auftraggeber, der andere hat im Auftrag geschrieben)
create or replace function public.can_review(p_job uuid, p_reviewer uuid, p_reviewed uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select p_reviewer is distinct from p_reviewed and exists (
    select 1 from public.jobs j
    where j.id = p_job
      and j.status = 'closed'
      and (
        (j.user_id = p_reviewer and exists (select 1 from public.messages m where m.job_id=j.id and (m.sender_id=p_reviewed or m.receiver_id=p_reviewed)))
        or
        (j.user_id = p_reviewed and exists (select 1 from public.messages m where m.job_id=j.id and (m.sender_id=p_reviewer or m.receiver_id=p_reviewer)))
      )
  );
$$;
grant execute on function public.can_review(uuid,uuid,uuid) to anon, authenticated;

-- 5) Row-Level-Security ------------------------------------------------------
alter table public.reviews enable row level security;

-- Bewertungen öffentlich lesbar (Vertrauen auf Profilseite)
drop policy if exists "reviews_select_all" on public.reviews;
create policy "reviews_select_all" on public.reviews for select using (true);

-- Insert: nur eingeloggt, reviewer_id = auth.uid(), beteiligt + Auftrag abgeschlossen
drop policy if exists "reviews_insert_self"     on public.reviews;   -- alte, zu lockere Policy entfernen
drop policy if exists "reviews_insert_involved" on public.reviews;
create policy "reviews_insert_involved" on public.reviews for insert to authenticated
  with check ( auth.uid() = reviewer_id and public.can_review(job_id, reviewer_id, reviewee_id) );

-- Eigene Bewertung ändern/löschen
drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews for update using (auth.uid() = reviewer_id) with check (auth.uid() = reviewer_id);
drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews for delete using (auth.uid() = reviewer_id);

-- 6) Aggregat-Trigger: profiles.rating + review_count automatisch -----------
create or replace function public.refresh_profile_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  target := coalesce(new.reviewee_id, old.reviewee_id);
  update public.profiles p set
    rating       = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where reviewee_id = target), 0),
    review_count = (select count(*) from public.reviews where reviewee_id = target)
  where p.id = target;
  return null;
end; $$;
drop trigger if exists on_review_change on public.reviews;
create trigger on_review_change
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_profile_rating();

-- ============================================================================
-- FERTIG.  Test (optional, im SQL-Editor):
--   select public.can_review('<job-uuid>','<owner-uuid>','<helper-uuid>');
--   -> true, wenn der Auftrag 'closed' ist und beide beteiligt sind.
-- ============================================================================
