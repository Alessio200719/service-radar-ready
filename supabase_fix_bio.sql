-- ============================================================
-- Service Radar – Fix: Profil speichern ("bio"-Spalte)
-- Im Supabase SQL Editor ausführen (New query -> einfügen -> Run).
-- Legt die fehlende Spalte an. Mehrfaches Ausführen ist gefahrlos.
-- ============================================================

alter table public.profiles add column if not exists bio           text;
alter table public.profiles add column if not exists review_count  integer default 0;
alter table public.profiles add column if not exists email_verified  boolean default false;
alter table public.profiles add column if not exists phone_verified  boolean default false;
alter table public.profiles add column if not exists stripe_verified boolean default false;

-- Sicherstellen, dass Nutzer ihr eigenes Profil bearbeiten dürfen
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- PostgREST-Schema-Cache neu laden, damit die Spalten sofort nutzbar sind
notify pgrst, 'reload schema';
