-- =========================================================================
-- Endoscopy Scheduling Dashboard — Supabase Setup
-- =========================================================================
-- Run this entire file in the Supabase SQL Editor (Dashboard → SQL → New).
-- It creates the tables, security policies, and realtime publication that
-- the dashboard depends on.
--
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE everywhere.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------------

-- Staff roster (one row per person)
create table if not exists public.staff (
  id              text primary key,
  display         text not null,
  full_name       text,
  role            text not null check (role in ('Tech', 'RN', 'FD')),
  primary_location text not null,
  eligible        jsonb not null default '[]'::jsonb,
  notes           text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id)
);

-- Per-location rules (one row per location)
create table if not exists public.rules (
  location        text primary key,
  room_owners     jsonb not null default '{}'::jsonb,
  rotation_orders jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id)
);

-- Schedules (one row per week + location)
create table if not exists public.schedules (
  week            text not null,                -- 'YYYY-MM-DD' Monday key
  location        text not null,
  data            jsonb not null,                -- full schedule blob
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id),
  primary key (week, location)
);

-- Index to speed up "list all weeks" queries
create index if not exists idx_schedules_week on public.schedules (week);

-- -------------------------------------------------------------------------
-- Auto-update updated_at on every write
-- -------------------------------------------------------------------------

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.staff;
create trigger set_updated_at before insert or update on public.staff
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.rules;
create trigger set_updated_at before insert or update on public.rules
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.schedules;
create trigger set_updated_at before insert or update on public.schedules
  for each row execute function public.tg_set_updated_at();

-- -------------------------------------------------------------------------
-- Row Level Security
-- Any authenticated user has full read/write access. Anonymous users get
-- nothing. This matches the v1 trust model (everyone sees everything) but
-- requires sign-in.
-- -------------------------------------------------------------------------

alter table public.staff      enable row level security;
alter table public.rules      enable row level security;
alter table public.schedules  enable row level security;

-- Drop and recreate policies (so re-running is safe)
drop policy if exists "auth_all_staff"     on public.staff;
drop policy if exists "auth_all_rules"     on public.rules;
drop policy if exists "auth_all_schedules" on public.schedules;

create policy "auth_all_staff"     on public.staff     for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all_rules"     on public.rules     for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all_schedules" on public.schedules for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- -------------------------------------------------------------------------
-- Realtime publication
-- Tells Supabase to broadcast row-level changes on these tables to
-- subscribed clients.
-- -------------------------------------------------------------------------

-- Make sure the publication exists (it does by default, but be defensive)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end$$;

-- Add our tables to the publication if they aren't already
alter publication supabase_realtime add table public.staff;
alter publication supabase_realtime add table public.rules;
alter publication supabase_realtime add table public.schedules;

-- -------------------------------------------------------------------------
-- Done. After running this:
--   1. Disable email signups in Authentication → Providers → Email
--      (uncheck "Enable signups") so only manually-created users can sign in
--   2. Add your supervisor accounts in Authentication → Users → Add user
--   3. Copy your Project URL and anon key from Settings → API
-- -------------------------------------------------------------------------
