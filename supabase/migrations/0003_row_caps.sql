-- ============================================================================
-- 0003_row_caps.sql
--
-- Limit what one account can create.
--
-- The publishable key ships inside the bundle, so anyone who opens the app can
-- read it, sign up, and start inserting. RLS in 0001 answers "whose rows are
-- these", which is the confidentiality question. It says nothing about "how
-- many", which is the availability one: without a limit, a single account can
-- fill the 500 MB free tier on its own and take sign-in and sync down for
-- everyone.
--
-- There is no server tier to rate limit in, so the limit lives here.
--
-- Two limits, because either one alone is a fence with a gate in it:
--
--   1. How many rows an account may hold.
--   2. How large a row may be. `name` and `special_types` are unbounded text
--      and jsonb, and Postgres will happily TOAST a single value up to a
--      gigabyte. A row count with no size bound stops nothing.
--
-- profiles and preferences need no count limit. Both are keyed by user_id
-- alone, so an account cannot hold more than one of either. They still get
-- size limits below.
--
-- Deliberately not here: value ranges on num_courts, num_rounds and
-- default_rating. Nonsense in those breaks the app for the one account that
-- set them and costs no storage, so it is a validation question, not a
-- capacity one.
-- ============================================================================


-- ------------------------------------------------------------- the numbers --
-- One place to read them from, so the proof script asserts against the value
-- the database is actually enforcing rather than a copy that can drift.
--
-- Both are set against measured use. On 2026-08-09 the busiest account held 31
-- players and 6 groups, so these are roughly 60x and 80x the real ceiling.
--
-- They count physical rows, tombstones included. Deleting a group sets
-- deleted_at rather than removing the row, because a physical delete would be
-- resurrected by the next device to sync. That is a deliberate choice made in
-- 0001, and it means an account that churns groups for years accumulates rows
-- it can no longer see. The limits are set wide enough to absorb that. The
-- alternative, counting only live rows, would let an attacker insert, tombstone
-- and insert again without limit, which is no limit at all.
create or replace function public.row_cap(which text)
returns integer language sql immutable parallel safe as $$
  select case which
           when 'players' then 2000
           when 'rosters' then 500
         end;
$$;


-- ------------------------------------------------------------ how many rows --
-- AFTER STATEMENT with a transition table, not BEFORE ROW, for three reasons
-- that were tested rather than assumed:
--
--   * Sync writes with upsert. A BEFORE ROW trigger fires for every row of an
--     `insert ... on conflict do update`, including the ones that turn out to
--     be updates, so an account sitting at its limit would be unable to edit
--     what it already has. The transition table holds only the rows genuinely
--     inserted: re-sending rows the server already has produces a transition
--     table of zero.
--   * It counts once per statement instead of once per row. Pushing a batch of
--     500 is one count, not 500.
--   * Raising here still aborts the whole statement and rolls back every row of
--     it, so a batch that would cross the limit lands in full or not at all.
--
-- Invoker rights, not security definer. Running as the authenticated user means
-- RLS applies to the count, and the select policy from 0001 shows an account
-- exactly its own rows, so the count is already the true one. A definer
-- function would buy nothing and hold more privilege than it needs.
create or replace function public.cap_players()
returns trigger language plpgsql as $$
declare
  owner uuid;
  held  integer;
  cap   integer := public.row_cap('players');
begin
  for owner in select distinct user_id from inserted loop
    select count(*) into held from public.players where user_id = owner;
    if held > cap then
      raise exception
        'This account is full. It can hold % players, including ones it has deleted.', cap
        using errcode = 'P0001';
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.cap_rosters()
returns trigger language plpgsql as $$
declare
  owner uuid;
  held  integer;
  cap   integer := public.row_cap('rosters');
begin
  for owner in select distinct user_id from inserted loop
    select count(*) into held from public.rosters where user_id = owner;
    if held > cap then
      raise exception
        'This account is full. It can hold % groups, including ones it has deleted.', cap
        using errcode = 'P0001';
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists players_cap on public.players;
create trigger players_cap after insert on public.players
  referencing new table as inserted
  for each statement execute function public.cap_players();

drop trigger if exists rosters_cap on public.rosters;
create trigger rosters_cap after insert on public.rosters
  referencing new table as inserted
  for each statement execute function public.cap_rosters();


-- ------------------------------------------------------------ how big a row --
-- Every limit below is far above anything the app produces. Measured on
-- 2026-08-09 across the live project: the longest player name was 10
-- characters, the longest group name 25, the largest special_types 174 bytes,
-- and the widest roster_ids array held 5 entries in 186 bytes.
--
-- ids are generated by generateId() in src/utils/helpers.ts, which returns
-- either a 36 character uuid or a 14 character fallback for browsers without
-- crypto.randomUUID. 64 leaves room and still refuses a megabyte.
--
-- octet_length(x::text) is used for the array and the jsonb because it measures
-- bytes, which is the thing being rationed. Both casts are immutable, so a
-- CHECK accepts them; that was verified before writing this, since a rejected
-- constraint expression fails the whole migration.

alter table public.players
  add constraint players_id_len   check (length(id)   <= 64),
  add constraint players_name_len check (length(name) <= 200),
  -- Cardinality is bounded by the group limit above: a player cannot belong to
  -- more groups than the account can hold. The byte bound is the backstop, for
  -- an array of few but enormous entries.
  add constraint players_roster_ids_size check (
    cardinality(roster_ids) <= 500
    and octet_length(roster_ids::text) <= 32768
  );

alter table public.rosters
  add constraint rosters_id_len   check (length(id)   <= 64),
  add constraint rosters_name_len check (length(name) <= 200);

alter table public.preferences
  add constraint preferences_active_roster_id_len check (length(active_roster_id) <= 64),
  add constraint preferences_special_types_size   check (octet_length(special_types::text) <= 8000);

-- profiles holds one row per account and the app never writes to it, but the
-- policies from 0001 let an account update its own row, so these columns are
-- reachable by anyone willing to call PostgREST directly. 320 is the longest
-- address RFC 5321 allows.
alter table public.profiles
  add constraint profiles_email_len  check (length(email) <= 320),
  add constraint profiles_plan_len   check (length(plan)  <= 64),
  add constraint profiles_status_len check (length(subscription_status) <= 32);


-- Tell PostgREST the schema moved.
notify pgrst, 'reload schema';
