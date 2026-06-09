-- HINWEIS: Wenn beim Ausführen "operator does not exist: uuid = bigint" kommt,
-- haben deine bestehenden Tabellen alte bigint-IDs. Nutze dann supabase_schema_RESET.sql
-- (löscht + erstellt die 4 public-Tabellen sauber mit UUID; auth.users bleibt erhalten).
-- ============================================================
-- Service Radar – Supabase schema, RLS, profile trigger
-- ============================================================
-- RUN THIS ONCE in Supabase → SQL Editor.
-- It is FULLY IDEMPOTENT and SAFE TO RE-RUN:
--   * It does NOT drop your data.
--   * It ADDS any missing columns to an already-existing `profiles` table
--     (CREATE TABLE IF NOT EXISTS alone does NOT add columns to a table that
--      already exists – that is why your profiles table only had id+created_at).
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1) PROFILES
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

-- Add every column we need, whether the table is brand new or pre-existing:
alter table public.profiles add column if not exists user_id    uuid;
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists full_name  text;
alter table public.profiles add column if not exists role       text default 'jobber';
alter table public.profiles add column if not exists phone      text;
alter table public.profiles add column if not exists city       text;
alter table public.profiles add column if not exists rating     numeric default 0;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists created_at timestamptz default now();

-- role check (drop+recreate so re-running is safe)
alter table public.profiles drop constraint if exists profiles_role_chk;
alter table public.profiles add  constraint profiles_role_chk check (role in ('jobber','auftraggeber'));

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all"  on public.profiles;
create policy "profiles_select_all"  on public.profiles for select using (true);
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row when a new auth user is created.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that registered BEFORE the trigger existed:
insert into public.profiles (id, user_id, email, full_name, role)
select u.id, u.id, u.email,
       coalesce(u.raw_user_meta_data->>'full_name',''),
       coalesce(u.raw_user_meta_data->>'role','jobber')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ============================================================
-- 2) JOBS
-- ============================================================
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid()
);
alter table public.jobs add column if not exists user_id     uuid references public.profiles(id) on delete cascade;
alter table public.jobs add column if not exists title       text;
alter table public.jobs add column if not exists description text;
alter table public.jobs add column if not exists category    text default 'g';
alter table public.jobs add column if not exists city        text;
alter table public.jobs add column if not exists latitude    double precision;
alter table public.jobs add column if not exists longitude   double precision;
alter table public.jobs add column if not exists price       numeric;
alter table public.jobs add column if not exists status      text default 'active';
alter table public.jobs add column if not exists created_at  timestamptz default now();

create index if not exists jobs_status_idx  on public.jobs(status);
create index if not exists jobs_user_idx    on public.jobs(user_id);
create index if not exists jobs_created_idx on public.jobs(created_at desc);

alter table public.jobs enable row level security;
drop policy if exists "jobs_select_active" on public.jobs;
create policy "jobs_select_active" on public.jobs for select using (status = 'active');
drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own"    on public.jobs for select using (auth.uid() = user_id);
drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own"    on public.jobs for insert with check (auth.uid() = user_id);
drop policy if exists "jobs_update_own" on public.jobs;
create policy "jobs_update_own"    on public.jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "jobs_delete_own" on public.jobs;
create policy "jobs_delete_own"    on public.jobs for delete using (auth.uid() = user_id);

-- ============================================================
-- 3) APPLICATIONS
-- ============================================================
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid()
);
alter table public.applications add column if not exists job_id     uuid references public.jobs(id) on delete cascade;
alter table public.applications add column if not exists helper_id  uuid references public.profiles(id) on delete cascade;
alter table public.applications add column if not exists message    text;
alter table public.applications add column if not exists status     text default 'sent';
alter table public.applications add column if not exists created_at timestamptz default now();
-- unique (job_id, helper_id)
do $$ begin
  alter table public.applications add constraint applications_job_helper_uniq unique (job_id, helper_id);
exception when duplicate_table or duplicate_object then null; end $$;

create index if not exists applications_job_idx    on public.applications(job_id);
create index if not exists applications_helper_idx on public.applications(helper_id);

alter table public.applications enable row level security;
drop policy if exists "applications_select_involved" on public.applications;
create policy "applications_select_involved" on public.applications for select
  using (auth.uid() = helper_id or auth.uid() = (select user_id from public.jobs where jobs.id = applications.job_id));
drop policy if exists "applications_insert_helper" on public.applications;
create policy "applications_insert_helper" on public.applications for insert with check (auth.uid() = helper_id);
drop policy if exists "applications_update_involved" on public.applications;
create policy "applications_update_involved" on public.applications for update
  using (auth.uid() = helper_id or auth.uid() = (select user_id from public.jobs where jobs.id = applications.job_id));

-- ============================================================
-- 4) MESSAGES (chat)
-- ============================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid()
);
alter table public.messages add column if not exists job_id      uuid references public.jobs(id) on delete cascade;
alter table public.messages add column if not exists sender_id   uuid references public.profiles(id) on delete cascade;
alter table public.messages add column if not exists receiver_id uuid references public.profiles(id) on delete cascade;
alter table public.messages add column if not exists message     text;
alter table public.messages add column if not exists created_at  timestamptz default now();

create index if not exists messages_job_idx     on public.messages(job_id);
create index if not exists messages_parts_idx   on public.messages(sender_id, receiver_id);
create index if not exists messages_created_idx on public.messages(created_at);

alter table public.messages enable row level security;
drop policy if exists "messages_select_involved" on public.messages;
create policy "messages_select_involved" on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "messages_insert_sender" on public.messages;
create policy "messages_insert_sender" on public.messages for insert with check (auth.uid() = sender_id);

-- Realtime for chat
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
