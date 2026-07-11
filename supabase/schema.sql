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
  sleep_onset_margin_min integer not null default 15,
  repay_mode text not null default 'auto' check (repay_mode in ('auto', 'fixed')),
  repay_fixed_min integer not null default 30,
  -- The live sleep/nap timer lives server-side so it follows the user
  -- across devices: start on the phone, finish anywhere.
  timer_started_at timestamptz,
  timer_kind text check (timer_kind in ('sleep', 'nap')),
  updated_at timestamptz not null default now()
);

alter table public.sleep_sessions enable row level security;
alter table public.settings enable row level security;

create policy "own sessions" on public.sleep_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------ social layer
-- Friends find each other by exact handle, connect via request -> accept,
-- and share ONLY the headline stats (debt + energy) — never raw sleep rows.

create table public.handles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  updated_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table public.shared_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  debt_min integer not null,
  energy integer,
  updated_at timestamptz not null default now()
);

alter table public.handles enable row level security;
alter table public.friendships enable row level security;
alter table public.shared_stats enable row level security;

-- Handles are the discoverable identity: any signed-in user can look one up.
create policy "handles searchable" on public.handles
  for select to authenticated using (true);
create policy "own handle insert" on public.handles
  for insert with check (auth.uid() = user_id);
create policy "own handle update" on public.handles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Both parties see the friendship; only the requester creates it; only the
-- addressee accepts; either side can sever it.
create policy "own friendships" on public.friendships
  for select using (auth.uid() in (requester_id, addressee_id));
create policy "send request" on public.friendships
  for insert with check (auth.uid() = requester_id);
create policy "accept request" on public.friendships
  for update using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);
create policy "leave friendship" on public.friendships
  for delete using (auth.uid() in (requester_id, addressee_id));

-- Stats are visible to yourself and accepted friends only.
create policy "stats visible to friends" on public.shared_stats
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = shared_stats.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = shared_stats.user_id))
    )
  );
create policy "own stats insert" on public.shared_stats
  for insert with check (auth.uid() = user_id);
create policy "own stats update" on public.shared_stats
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
