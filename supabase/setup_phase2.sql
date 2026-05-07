-- =========================================================================
-- Endoscopy Scheduling Dashboard — Phase 2 Migration
-- =========================================================================
-- Adds the time_off table for tracking staff out-of-office periods.
-- Run this once in the Supabase SQL Editor AFTER the original setup.sql.
--
-- Safe to re-run.
-- =========================================================================

create table if not exists public.time_off (
  id          uuid primary key default gen_random_uuid(),
  staff_id    text not null references public.staff(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  check (end_date >= start_date)
);

-- Quick lookup of "is X out on date Y"
create index if not exists idx_time_off_staff_dates
  on public.time_off (staff_id, start_date, end_date);

-- RLS: same pattern as other tables - any authenticated user can read/write
alter table public.time_off enable row level security;

drop policy if exists "auth_all_time_off" on public.time_off;
create policy "auth_all_time_off" on public.time_off for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Track who created the row
create or replace function public.tg_set_time_off_created_by()
returns trigger language plpgsql as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_created_by on public.time_off;
create trigger set_created_by before insert on public.time_off
  for each row execute function public.tg_set_time_off_created_by();

-- Realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'time_off'
  ) then
    alter publication supabase_realtime add table public.time_off;
  end if;
end$$;

-- =========================================================================
-- Done. After running this:
--   - The dashboard's Staff tab will show an "Off" indicator next to each
--     person and let supervisors mark date ranges
--   - Auto-fill Rotations will skip people who are out
--   - Validation panel will warn when someone scheduled is marked off
-- =========================================================================
