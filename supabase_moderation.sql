-- ============================================================
-- Service Radar – Moderation serverseitig (Meldungen, Verwarnungen, Sperren)
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist gefahrlos.
--
-- Warum: Bisher lagen Meldungen, Verwarnungen und Sperren im localStorage des
-- Browsers. Sie galten damit nur auf einem Gerät und liessen sich durch Löschen
-- der Websitedaten umgehen. Ab jetzt liegen sie in der Datenbank.
-- ============================================================

-- ── 1) Meldungen ────────────────────────────────────────────
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references auth.users(id) on delete set null,
  target_type  text not null,                       -- 'job' | 'user'
  target_id    text not null,
  target_label text,
  reason       text not null,
  detail       text,
  status       text not null default 'open',        -- 'open' | 'reviewed' | 'closed'
  created_at   timestamptz not null default now()
);
create index if not exists reports_target_idx  on public.reports(target_type, target_id);
create index if not exists reports_created_idx on public.reports(created_at desc);

alter table public.reports enable row level security;
-- Nur der Server (service_role) schreibt und liest. Nutzer sehen nichts davon.
drop policy if exists "reports_none" on public.reports;

-- ── 2) Verwarnungen ─────────────────────────────────────────
create table if not exists public.user_warnings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  reason     text not null,
  created_at timestamptz not null default now()
);
create index if not exists user_warnings_user_idx on public.user_warnings(user_id);

alter table public.user_warnings enable row level security;
-- Jeder darf SEINE EIGENEN Verwarnungen sehen (Transparenz), aber keine anlegen.
drop policy if exists "warnings_select_self" on public.user_warnings;
create policy "warnings_select_self" on public.user_warnings
  for select using (auth.uid() = user_id);

-- ── 3) Sperren ──────────────────────────────────────────────
create table if not exists public.user_bans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  reason     text,
  until      timestamptz,                            -- NULL = unbefristet
  created_at timestamptz not null default now()
);

alter table public.user_bans enable row level security;
-- Jeder darf sehen, ob ER SELBST gesperrt ist. Setzen darf nur der Server.
drop policy if exists "bans_select_self" on public.user_bans;
create policy "bans_select_self" on public.user_bans
  for select using (auth.uid() = user_id);

-- ── 4) Gesperrte Nutzer dürfen keine Aufträge mehr einstellen ──
-- Die vorhandene Insert-Policy wird um eine Sperrprüfung erweitert.
drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own" on public.jobs
  for insert with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.user_bans b
      where b.user_id = auth.uid()
        and (b.until is null or b.until > now())
    )
  );

-- ── 5) Gesperrte Nutzer dürfen keine Nachrichten mehr senden ──
drop policy if exists "messages_insert_sender" on public.messages;
create policy "messages_insert_sender" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and not exists (
      select 1 from public.user_bans b
      where b.user_id = auth.uid()
        and (b.until is null or b.until > now())
    )
  );

notify pgrst, 'reload schema';

-- ============================================================
-- Nutzer sperren (manuell, im SQL Editor):
--   insert into public.user_bans (user_id, reason)
--   values ('<uuid-des-nutzers>', 'Wiederholte Verstöße')
--   on conflict (user_id) do update set reason = excluded.reason;
--
-- Sperre aufheben:
--   delete from public.user_bans where user_id = '<uuid>';
--
-- Offene Meldungen ansehen:
--   select * from public.reports where status = 'open' order by created_at desc;
-- ============================================================
