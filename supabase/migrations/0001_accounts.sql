-- ============================================================================
-- 0001_accounts.sql
--
-- Accounts and cloud sync, phase 1. Four tables, each enabling Row Level
-- Security in this same migration, with select / insert / update / delete all
-- restricted to rows where auth.uid() matches the row's user_id.
--
-- Run it once, whole, in the Supabase SQL Editor. It is written to be safe to
-- read top to bottom before you do.
-- ============================================================================


-- Server-owned pull cursor. A BEFORE trigger, so a client that tries to send
-- this column has its value discarded rather than honoured. Clients order their
-- own conflicts with updated_at; this one exists only so an incremental pull
-- can never miss a row because some device's clock was wrong.
create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------- profiles --
-- One row per user. The subscription columns are reserved: nothing reads or
-- writes them yet, they exist so adding billing later is a backfill rather than
-- a schema change.
--
-- user_id is both the primary key and the policy column. Naming it user_id
-- rather than the more usual id means every policy in this file reads
-- identically, which is worth the small redundancy.
create table public.profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  email               text,
  subscription_status text not null default 'free',
  plan                text,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  server_updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Note that the update policy carries both using and with check. With only
-- using, a user could update their own row and set user_id to someone else's,
-- handing the row away. That applies to every table below too.
create policy profiles_select on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy profiles_delete on public.profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_server_updated_at();


-- ----------------------------------------------------------------- rosters --
-- Groups. Mirrors the Roster type in src/types/index.ts.
create table public.rosters (
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- text, not uuid: generateId() in src/utils/helpers.ts falls back to
  -- 'xxxx-xxxx-xxxx' on browsers without crypto.randomUUID, and devices
  -- carrying ids in that shape exist. A uuid column would reject them.
  id                text not null,
  name              text not null,
  -- Tombstone. Clients never issue a physical delete: without this, deleting a
  -- group on one phone and then syncing another would resurrect it, because the
  -- second phone still holds the row and would push it back.
  deleted_at        timestamptz,
  -- Client clock. Orders last-write-wins, so an edit made offline on Tuesday
  -- does not beat one made on Wednesday just because it synced later.
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.rosters enable row level security;

create policy rosters_select on public.rosters
  for select to authenticated using ((select auth.uid()) = user_id);
create policy rosters_insert on public.rosters
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy rosters_update on public.rosters
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy rosters_delete on public.rosters
  for delete to authenticated using ((select auth.uid()) = user_id);

create index rosters_pull_idx on public.rosters (user_id, server_updated_at);

create trigger rosters_touch before insert or update on public.rosters
  for each row execute function public.touch_server_updated_at();


-- ----------------------------------------------------------------- players --
-- The global player pool. Mirrors the Player type in src/types/index.ts.
create table public.players (
  user_id           uuid not null references auth.users(id) on delete cascade,
  id                text not null,
  name              text not null,
  -- real, not numeric: PostgREST serialises numeric as a JSON *string* to
  -- preserve precision. "3.75" flowing into sumRatings() would concatenate
  -- instead of adding, and quietly corrupt every balance calculation. real
  -- round-trips as a JS number, and ratings move in 0.25 steps, which float4
  -- represents exactly.
  rating            real not null,
  gender            text not null check (gender in ('M','F')),
  -- An array, matching Player.rosterIds one for one. A join table is the more
  -- correct relational answer, but it would cost a shape translation on every
  -- read and write plus a second entity in the sync outbox, buying integrity
  -- the client does not rely on today.
  roster_ids        text[] not null default '{}',
  deleted_at        timestamptz,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.players enable row level security;

create policy players_select on public.players
  for select to authenticated using ((select auth.uid()) = user_id);
create policy players_insert on public.players
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy players_update on public.players
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy players_delete on public.players
  for delete to authenticated using ((select auth.uid()) = user_id);

create index players_pull_idx on public.players (user_id, server_updated_at);

create trigger players_touch before insert or update on public.players
  for each row execute function public.touch_server_updated_at();


-- ------------------------------------------------------------- preferences --
-- One row per user, last-write-wins as a whole. These are single scalars that
-- nobody edits concurrently, so giving each its own row would be ceremony.
create table public.preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  active_roster_id  text,
  default_rating    real    not null default 4.0,
  num_courts        int     not null default 3,
  num_rounds        int     not null default 8,
  large_text        boolean not null default false,
  -- The SpecialGameTypes shape, stored verbatim.
  special_types     jsonb   not null default '{}'::jsonb,
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

alter table public.preferences enable row level security;

create policy preferences_select on public.preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy preferences_insert on public.preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy preferences_update on public.preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy preferences_delete on public.preferences
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger preferences_touch before insert or update on public.preferences
  for each row execute function public.touch_server_updated_at();


-- -------------------------------------------------------- profile on signup --
-- security definer so it can write past RLS. The empty search_path is
-- Supabase's current guidance against search-path injection in definer
-- functions, and is why every reference below is schema-qualified.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
