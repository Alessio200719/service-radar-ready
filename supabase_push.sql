-- ============================================================================
-- Service Radar – Web Push: Tabelle push_subscriptions  ·  IDEMPOTENT
-- Einmal im Supabase SQL-Editor ausführen. Löscht keine Daten.
-- ============================================================================
create extension if not exists "pgcrypto";

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade,
  endpoint     text unique not null,
  subscription jsonb not null,
  created_at   timestamptz default now()
);
alter table public.push_subscriptions add column if not exists user_id      uuid references public.profiles(id) on delete cascade;
alter table public.push_subscriptions add column if not exists subscription jsonb;
alter table public.push_subscriptions add column if not exists created_at   timestamptz default now();

create index if not exists push_sub_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Nutzer sieht / speichert / aktualisiert / löscht NUR die eigene Subscription
drop policy if exists "push_select_own" on public.push_subscriptions;
create policy "push_select_own" on public.push_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "push_insert_own" on public.push_subscriptions;
create policy "push_insert_own" on public.push_subscriptions for insert with check (auth.uid() = user_id);
drop policy if exists "push_update_own" on public.push_subscriptions;
create policy "push_update_own" on public.push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_delete_own" on public.push_subscriptions for delete using (auth.uid() = user_id);

-- Hinweis: Die Vercel-Routes nutzen den SUPABASE_SERVICE_ROLE_KEY (serverseitig)
-- und umgehen RLS bewusst – zum Speichern (Upsert) und zum Versenden (alle
-- Subscriptions eines Empfängers lesen). Der service_role-Key gehört NUR in die
-- Vercel-Umgebungsvariablen, niemals ins Frontend.
-- ============================================================================
