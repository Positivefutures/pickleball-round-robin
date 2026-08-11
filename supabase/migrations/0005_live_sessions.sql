-- ============================================================================
-- 0005_live_sessions.sql
--
-- Let a host publish the session they are running, so the people playing in it
-- can watch it on their own phones.
--
-- Run it once, whole, in the Supabase SQL Editor, and run it BEFORE deploying
-- the client that goes with it. The last statement in this file adds a column
-- to preferences: a client that sends scoring_enabled to a table that has not
-- got it yet gets PGRST204, and PostgREST rejects the whole preferences row, so
-- every signed-in user loses all preference sync until the column exists.
--
-- This is the first thing in the schema that anybody can read without signing
-- in, and that is the whole difficulty. 0001 answers "whose rows are these" and
-- 0003 answers "how many", and both lean on there being an auth.uid() to
-- compare against. A player pointing a camera at a QR code has no account and
-- never will.
--
-- The shape here, and the reasoning for it:
--
--   * The table itself stays owner-only. Four policies identical to the ones in
--     0001, RLS on, nothing granted to anon. A share is still a row that
--     belongs to somebody.
--   * Reading is a security definer function taking the share key. It returns
--     one column of one row, or null.
--
-- The rejected alternative is worth writing down, because it is the obvious one
-- and it is a disaster. A permissive select policy -- `for select to anon using
-- (true)` -- does not mean "anyone holding a link can read that one session".
-- PostgREST allows an unfiltered select, so it means anyone at all can ask for
-- the table and get every session in it, along with the user_id that owns each.
-- The function exists so that the only question anybody can ask is "what is
-- behind this exact key", which is the question the feature is actually for.
--
-- With no server tier there is nothing to rate limit in, so the share key's own
-- entropy is the whole defence against someone working through the space. The
-- client mints ten characters from a 32 symbol alphabet, which is 2^50.
-- ============================================================================


-- ---------------------------------------------------------- shared_sessions --
-- One row per published session. The snapshot is a single jsonb document rather
-- than a set of columns, following special_types in 0001: a session already is
-- one JSON object, the scores ride on the courts inside it, and every later
-- field becomes a client change rather than another migration.
--
-- share_key is the primary key because looking a session up by its key is the
-- only read this table has. It is minted by the client, so two hosts can in
-- principle draw the same one; that surfaces as a 23505 on insert, and the
-- client answers by minting another. The row it collided with is one RLS hides
-- from it, which is exactly why it cannot be an upsert conflict target for
-- somebody else's row.
--
-- session_id is the app's own id for the afternoon, minted when a schedule is
-- generated. It is here so a session can be recognised across a stop and a
-- restart rather than becoming a second row with a second link.
create table public.shared_sessions (
  share_key   text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  session_id  text not null,
  snapshot    jsonb not null,
  -- Always set by the trigger below rather than trusted from the client.
  expires_at  timestamptz not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

-- The owner's own list: Stop Sharing, and the cap trigger's count.
create index shared_sessions_owner_idx on public.shared_sessions (user_id);

alter table public.shared_sessions enable row level security;

create policy shared_sessions_select on public.shared_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy shared_sessions_insert on public.shared_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy shared_sessions_update on public.shared_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy shared_sessions_delete on public.shared_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger shared_sessions_touch before insert or update on public.shared_sessions
  for each row execute function public.touch_server_updated_at();


-- --------------------------------------------------------- how long it lives --
-- The client asks for a day. This is what actually decides.
--
-- expires_at arrives from the browser, so without this a hand-made request
-- could ask for the year 3000 and hold a public document open forever. A CHECK
-- cannot do the job because now() is not immutable, so it is a BEFORE trigger,
-- and it clamps rather than raises: the honest client is never refused and the
-- dishonest one simply does not get what it asked for.
--
-- Two days rather than one. The client's window is a day, and the gap absorbs a
-- phone whose clock is wrong without ever letting a share outlive its weekend.
create or replace function public.clamp_share_expiry()
returns trigger language plpgsql as $$
declare
  ceiling timestamptz := now() + interval '48 hours';
begin
  if new.expires_at is null or new.expires_at > ceiling then
    new.expires_at = ceiling;
  end if;
  return new;
end;
$$;

create trigger shared_sessions_expiry before insert or update on public.shared_sessions
  for each row execute function public.clamp_share_expiry();


-- ------------------------------------------------------------- how many, how big --
-- 0003's argument applies here with more force, because these rows are the only
-- ones in the schema a stranger can reach. Its comments explain why the count is
-- a statement-level trigger over a transition table: an upsert that resolves to
-- an update must not be refused just because the account is at its limit.
--
-- row_cap is replaced rather than added to, so the numbers stay in the one
-- place 0003 put them. The players and rosters cases are restated unchanged.
create or replace function public.row_cap(which text)
returns integer language sql immutable parallel safe as $$
  select case which
           when 'players' then 2000
           when 'rosters' then 500
           -- A host runs one session at a time. Twenty is room for a year of
           -- afternoons that were never stopped, and still a bounded number of
           -- public documents per account.
           when 'shares'  then 20
         end;
$$;

create or replace function public.cap_shared_sessions()
returns trigger language plpgsql as $$
declare
  owner uuid;
  held  integer;
  cap   integer := public.row_cap('shares');
begin
  for owner in select distinct user_id from inserted loop
    select count(*) into held from public.shared_sessions where user_id = owner;
    if held > cap then
      raise exception
        'This account is full. It can hold % shared sessions.', cap
        using errcode = 'P0001';
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists shared_sessions_cap on public.shared_sessions;
create trigger shared_sessions_cap after insert on public.shared_sessions
  referencing new table as inserted
  for each statement execute function public.cap_shared_sessions();

-- Measured against the shape the client publishes: a redacted player is about
-- 95 bytes, and twelve rounds of ten courts comes to roughly 55 KB. 256 KB is
-- about five times the largest session this app can produce, and still refuses
-- the gigabyte that an unbounded jsonb would otherwise accept.
alter table public.shared_sessions
  add constraint shared_sessions_key_len     check (length(share_key)  = 10),
  add constraint shared_sessions_session_len check (length(session_id) <= 64),
  add constraint shared_sessions_size        check (octet_length(snapshot::text) <= 262144);


-- ------------------------------------------------------------- reading one --
-- The only thing in this schema anon may call. The safeguards, in the shape
-- 0004 established:
--
--   1. **One argument, and it is the secret itself.** There is no user id and
--      no row id to pass, so there is nothing to aim at a session whose key you
--      do not already have. Holding the key is the whole permission model.
--   2. **It returns one column.** `snapshot` and nothing else, so user_id,
--      session_id, expires_at and the timestamps cannot leave the database even
--      by accident. Widening the select list is the way this function would be
--      broken, and it is the thing to look at first if it ever is.
--   3. **Empty search_path, everything schema qualified**, the same as
--      handle_new_user() in 0001 and delete_my_account() in 0004.
--   4. **The argument is named `key`, and that matters.** Naming it share_key
--      would make `where s.share_key = share_key` ambiguous, Postgres resolves
--      such a reference to the column, and the predicate would quietly become
--      `s.share_key = s.share_key`. That is true for every row, so the function
--      would hand any caller somebody else's session. There is no column named
--      `key` on this table, so this name cannot collide.
--
-- A key that never existed, one that has expired and one that was stopped all
-- return null, deliberately and identically. Telling a caller that a key is
-- real but finished is exactly the signal somebody working through the key
-- space is looking for, and the viewer has nothing useful to do with the
-- difference: either way there is nothing to watch.
--
-- Stop Sharing deletes the row rather than marking it. There is nothing a
-- tombstone could say that this function is willing to repeat, and rows that
-- accumulate would eventually meet the cap above and leave an account unable to
-- share anything ever again.
create or replace function public.shared_session(key text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select s.snapshot
  from public.shared_sessions s
  where s.share_key = key
    and s.expires_at > now();
$$;

-- Postgres grants EXECUTE to PUBLIC on a new function, so the revoke is doing
-- real work. anon is then granted back deliberately: this one function is the
-- entire public surface of the database.
revoke all on function public.shared_session(text) from public;
grant execute on function public.shared_session(text) to anon, authenticated;


-- ------------------------------------------------ scoring, on the person --
-- Deferred out of the scoring release on purpose. preferences has fixed
-- columns, so this had to be sequenced with a migration rather than shipped
-- with a client, and sharing is the release that touches the database anyway.
--
-- Default false, matching stores.scoringEnabled, so every existing account
-- reads back exactly what it has now.
alter table public.preferences
  add column if not exists scoring_enabled boolean not null default false;


-- Tell PostgREST the schema moved, or shared_session is a 404 until the API
-- happens to reload on its own.
notify pgrst, 'reload schema';
