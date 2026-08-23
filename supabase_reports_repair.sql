-- ============================================================
-- Service Radar – Reparatur der Tabelle public.reports
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist gefahrlos.
--
-- Zweck: Falls die Tabelle bereits mit anderem Aufbau existierte, ergänzt
-- dieses Skript die fehlenden Spalten, statt sie zu überspringen.
-- ============================================================

-- 1) Tabelle anlegen, falls sie ganz fehlt
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid()
);

-- 2) Jede benötigte Spalte einzeln ergänzen (überspringt vorhandene)
alter table public.reports add column if not exists reporter_id  uuid;
alter table public.reports add column if not exists target_type  text;
alter table public.reports add column if not exists target_id    text;
alter table public.reports add column if not exists target_label text;
alter table public.reports add column if not exists reason       text;
alter table public.reports add column if not exists detail       text;
alter table public.reports add column if not exists status       text default 'open';
alter table public.reports add column if not exists created_at   timestamptz default now();

-- 3) Störende Pflichtfelder aus einer alten Fassung entschärfen
alter table public.reports alter column target_type drop not null;
alter table public.reports alter column target_id   drop not null;
alter table public.reports alter column reason      drop not null;

-- 4) Standardwerte sicherstellen
alter table public.reports alter column status     set default 'open';
alter table public.reports alter column created_at set default now();

-- 5) Indizes
create index if not exists reports_target_idx  on public.reports(target_type, target_id);
create index if not exists reports_created_idx on public.reports(created_at desc);

-- 6) RLS an – nur der Server (service_role) greift zu, Nutzer sehen nichts
alter table public.reports enable row level security;

notify pgrst, 'reload schema';

-- ── Kontrolle: welche Spalten hat die Tabelle jetzt? ──
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'reports'
order by ordinal_position;
