-- ============================================================
-- Service Radar – Newsletter (Double-Opt-in, DSGVO)
-- Idempotent: kann mehrfach ausgeführt werden.
-- Zugriff NUR über den Server (service_role). RLS aktiv, keine
-- anon/authenticated Policies => Frontend kann die Tabelle nicht lesen.
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists public.newsletter_subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  confirmed       boolean not null default false,
  token           text not null,
  source          text,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz
);

create index if not exists newsletter_token_idx on public.newsletter_subscribers (token);

alter table public.newsletter_subscribers enable row level security;

-- Sicherheit: nur der Server (service_role, umgeht RLS) darf zugreifen.
revoke all on public.newsletter_subscribers from anon, authenticated;
