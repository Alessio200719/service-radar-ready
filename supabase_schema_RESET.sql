-- ============================================================================
-- Service Radar – SAUBERER RESET (UUID)  ⚠️  BITTE LESEN
-- ============================================================================
-- Warum: Deine bestehenden Tabellen wurden früher mit bigint/int8-IDs angelegt.
-- auth.uid() ist aber uuid → Fehler "operator does not exist: uuid = bigint".
-- Ein In-Place-Umbau bigint→uuid ist fehleranfällig. Für einen MVP ohne echte
-- Daten ist ein Reset sauber und sicher.
--
-- ⚠️  DIESES SKRIPT LÖSCHT die Tabellen public.profiles, public.jobs,
--     public.applications, public.messages – INKL. INHALT.
--
-- ✅  Was NICHT gelöscht wird: deine angemeldeten Nutzer.
--     Diese liegen in auth.users (Authentication → Users) und bleiben erhalten.
--     Profile werden danach automatisch neu erzeugt (Trigger + Backfill unten).
--
-- ────────────────────────────────────────────────────────────────────────────
-- OPTIONAL ZUERST PRÜFEN (separat ausführen, ändert nichts):
--   select table_name, column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name in ('profiles','jobs','applications','messages')
--   order by table_name, ordinal_position;
--   -- Steht bei profiles.id "bigint"/"integer" statt "uuid" → Reset ist nötig.
-- ────────────────────────────────────────────────────────────────────────────
-- ZUM AUSFÜHREN: dieses komplette Skript in den Supabase SQL-Editor einfügen
-- und auf RUN klicken. Es ist auch mehrfach ausführbar (idempotent).
-- ============================================================================

create extension if not exists "pgcrypto";

-- 0) Alten Trigger + Funktion entfernen (hängen ggf. an profiles)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

-- 1) Alte (bigint-)Tabellen entfernen – Reihenfolge wegen Fremdschlüsseln
drop table if exists public.messages     cascade;
drop table if exists public.applications cascade;
drop table if exists public.jobs         cascade;
drop table if exists public.profiles     cascade;

-- ============================================================================
-- 2) PROFILES  (id = auth.users.id, UUID)
-- ============================================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  user_id    uuid,                              -- = id (für Frontends, die user_id erwarten)
  email      text,
  full_name  text,
  role       text not null default 'jobber' check (role in ('jobber','auftraggeber')),
  phone      text,
  city       text,
  rating     numeric default 0,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles_select_all"  on public.profiles for select using (true);
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ============================================================================
-- 3) TRIGGER  –  Profil bei jeder Registrierung automatisch anlegen
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, user_id, email, full_name, role, city)
  values (
    new.id,
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'jobber'),
    coalesce(new.raw_user_meta_data->>'city', '')
  )
  on conflict (id) do update
    set email     = excluded.email,
        full_name = coalesce(nullif(excluded.full_name,''), public.profiles.full_name),
        role      = coalesce(nullif(excluded.role,''),      public.profiles.role),
        user_id   = excluded.user_id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3b) BACKFILL – Profile für bereits registrierte Nutzer (deine bestehenden Users)
insert into public.profiles (id, user_id, email, full_name, role)
select u.id, u.id, u.email,
       coalesce(u.raw_user_meta_data->>'full_name',''),
       coalesce(u.raw_user_meta_data->>'role','jobber')
from auth.users u
on conflict (id) do nothing;

-- ============================================================================
-- 4) JOBS  (UUID)
-- ============================================================================
create table public.jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  category    text not null default 'g',
  city        text,
  latitude    double precision,
  longitude   double precision,
  price       numeric,
  status      text not null default 'active' check (status in ('active','pending','flagged','closed')),
  created_at  timestamptz not null default now()
);
create index jobs_status_idx  on public.jobs(status);
create index jobs_user_idx    on public.jobs(user_id);
create index jobs_created_idx on public.jobs(created_at desc);

alter table public.jobs enable row level security;
create policy "jobs_select_active" on public.jobs for select using (status = 'active');
create policy "jobs_select_own"    on public.jobs for select using (auth.uid() = user_id);
create policy "jobs_insert_own"    on public.jobs for insert with check (auth.uid() = user_id);
create policy "jobs_update_own"    on public.jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "jobs_delete_own"    on public.jobs for delete using (auth.uid() = user_id);

-- ============================================================================
-- 5) APPLICATIONS  (UUID)
-- ============================================================================
create table public.applications (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  helper_id  uuid not null references public.profiles(id) on delete cascade,
  message    text,
  status     text not null default 'sent' check (status in ('sent','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  unique (job_id, helper_id)
);
create index applications_job_idx    on public.applications(job_id);
create index applications_helper_idx on public.applications(helper_id);

alter table public.applications enable row level security;
create policy "applications_select_involved" on public.applications for select
  using (auth.uid() = helper_id
         or auth.uid() = (select user_id from public.jobs where jobs.id = applications.job_id));
create policy "applications_insert_helper" on public.applications for insert
  with check (auth.uid() = helper_id);
create policy "applications_update_involved" on public.applications for update
  using (auth.uid() = helper_id
         or auth.uid() = (select user_id from public.jobs where jobs.id = applications.job_id));

-- ============================================================================
-- 6) MESSAGES  (UUID, Chat)
-- ============================================================================
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references public.jobs(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  message     text not null,
  created_at  timestamptz not null default now()
);
create index messages_job_idx     on public.messages(job_id);
create index messages_parts_idx   on public.messages(sender_id, receiver_id);
create index messages_created_idx on public.messages(created_at);

alter table public.messages enable row level security;
create policy "messages_select_involved" on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "messages_insert_sender" on public.messages for insert
  with check (auth.uid() = sender_id);

-- 7) Realtime für Chat aktivieren
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- FERTIG. Erwartetes Ergebnis:
--   profiles.id = uuid (FK auf auth.users), Trigger aktiv, bestehende Nutzer
--   haben ein Profil (Backfill). jobs/applications/messages mit UUID + RLS.
-- ============================================================================
