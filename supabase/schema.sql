-- Sleep Check-in — Supabase schema.
-- Run this once in your project's SQL Editor (paste + Run).
-- Everything is protected by row-level security: each signed-in user can
-- only ever read or write their own rows. The anon key in js/config.js is
-- safe to publish because these policies are the actual security boundary.

-- One row per sleep session or nap. Imported rows carry an import_hash so
-- re-running the iOS Shortcut never duplicates them; editing a row flips
-- source to 'manual' (and keeps the hash so re-imports don't resurrect the
-- original); deleting sets a tombstone for the same reason.
create table public.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  kind text not null default 'sleep' check (kind in ('sleep', 'nap')),
  asleep_min integer not null,
  in_bed_min integer,
  stages jsonb,
  source text not null default 'import' check (source in ('import', 'manual')),
  import_hash text,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  check (end_ts > start_ts)
);

create unique index sleep_sessions_import_uniq
  on public.sleep_sessions (user_id, import_hash)
  where import_hash is not null;

create index sleep_sessions_user_end
  on public.sleep_sessions (user_id, end_ts desc);

-- Per-user settings; doubles as the profile.
create table public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  need_min integer not null default 480,
  caffeine_gap_min integer not null default 600,
  wake_target_min integer,
  prep_buffer_min integer not null default 60,
  debt_mode text not null default 'weighted' check (debt_mode in ('weighted', 'plain')),
  updated_at timestamptz not null default now()
);

alter table public.sleep_sessions enable row level security;
alter table public.settings enable row level security;

create policy "own sessions" on public.sleep_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
