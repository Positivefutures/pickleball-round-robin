-- ============================================================================
-- 0007_score_edits.sql
--
-- Let the people watching a shared session change its scores, if the host has
-- switched that on and told them a four digit code.
--
-- NOT YET APPLIED. Written alongside the host's half of the feature, which is
-- the toggle and the code boxes on the Share Session card. That half stores the
-- code on the host's phone and sends nothing new to this table, so the client
-- in production is safe against this file being run or not being run.
--
-- Run it once, whole, in the Supabase SQL Editor, and run it BEFORE deploying
-- the client that writes score_code_hash. 0005's header explains why that order
-- is not negotiable: a client sending a column PostgREST has not got yet gets
-- PGRST204 and the whole row is rejected, which here would mean every host's
-- session silently stopping publishing.
--
-- ## What this is, and what it is not
--
-- It is a lock on a door that anyone can see. Four digits is ten thousand
-- combinations, there is no server tier to rate limit in, and PostgREST will
-- answer as fast as it is asked. Somebody determined to change a score they
-- were not invited to change will manage it.
--
-- That is the right trade for what this actually guards: the score of a
-- friendly game, on a link that expires within the day, shared with the people
-- standing on the court. The code stops the wrong person tapping a number by
-- accident and stops a passer-by with the link editing at all. It is not a
-- password and nothing here should ever call it one.
--
-- What the design does refuse to do is make it worse than that:
--
--   * The code never rides in the snapshot. shared_session() returns one column
--     and this file does not widen it, so a watcher's phone cannot read the
--     code it is being asked for.
--   * Only a hash is stored, salted per share. A dump of this table does not
--     hand over the codes, and two hosts who both pick 1234 do not collide.
--   * The write function takes the code, not a session id. Holding the share
--     key and the code is the whole permission model, which is the same shape
--     0005 chose for reading.
-- ============================================================================


-- ------------------------------------------------------------ the two columns --
-- score_code_hash is sha256(salt || code), hex, or null when the host has not
-- switched editing on. The salt is minted per share by the client and is not a
-- secret; it is here so that ten thousand possible codes cannot be reversed
-- once for the whole table.
--
-- Nullable and defaulted to null, so every share that exists today reads back
-- exactly as it does now: editing off.
alter table public.shared_sessions
  add column if not exists score_code_hash text,
  add column if not exists score_code_salt text;

alter table public.shared_sessions
  drop constraint if exists shared_sessions_code_hash_len;
alter table public.shared_sessions
  add constraint shared_sessions_code_hash_len
    check (score_code_hash is null or length(score_code_hash) = 64);

alter table public.shared_sessions
  drop constraint if exists shared_sessions_code_salt_len;
alter table public.shared_sessions
  add constraint shared_sessions_code_salt_len
    check (score_code_salt is null or length(score_code_salt) between 16 and 64);


-- --------------------------------------------------------- is this the code --
-- Answers one question and returns one boolean: does this code open this share.
--
-- The safeguards are 0005's, restated because they apply one for one:
--
--   1. The arguments are the two secrets and nothing else. There is no row id
--      to aim at a session whose key you do not hold.
--   2. It returns a boolean, never the hash and never the salt.
--   3. Empty search_path, everything schema qualified.
--   4. The share key argument is named `key`, not `share_key`, so that
--      `s.share_key = key` cannot resolve to the column comparing with itself.
--      0005 explains what that bug would have cost; it would cost the same here.
--
-- False for a key that does not exist, one that has expired, one whose host has
-- not switched editing on, and one where the code is simply wrong. The caller
-- learns nothing from the difference, which is deliberate.
--
-- pgcrypto's digest() is used rather than Postgres's built-in sha256() because
-- the built-in takes bytea and returns bytea, and the client sends hex.
create extension if not exists pgcrypto with schema public;

create or replace function public.share_code_ok(key text, code text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (
      select s.score_code_hash is not null
         and s.score_code_salt is not null
         and s.score_code_hash = encode(
               public.digest(s.score_code_salt || code, 'sha256'), 'hex'
             )
      from public.shared_sessions s
      where s.share_key = key
        and s.expires_at > now()
    ),
    false
  );
$$;

revoke all on function public.share_code_ok(text, text) from public;
grant execute on function public.share_code_ok(text, text) to anon, authenticated;


-- ----------------------------------------------------------- leaving a score --
-- A watcher's score does not go into the snapshot. The host overwrites that
-- whole document within a second and a half of touching anything on their own
-- phone -- see publish() in liveSession.ts -- so a number written there would
-- be destroyed by the next tap the host made, at random, with nobody told.
--
-- So watchers append here instead, and the host's app drains it. One row per
-- submission rather than one per court: the host has to be able to tell a new
-- edit from one it has already taken, and a row it deletes is a far simpler
-- record of that than a version counter on a court.
--
-- Last write wins, which is Jeff's call on 2026-08-15. The host applies what it
-- drains in the order it was written, and anything the host types afterwards
-- stands because the host's own publish happens after. There is no merge and no
-- review step, and nothing here pretends otherwise.
create table if not exists public.score_edits (
  id          bigint generated always as identity primary key,
  share_key   text not null references public.shared_sessions(share_key) on delete cascade,
  -- Which court, in the host's own coordinates. Positions rather than numbers:
  -- two courts in one round can carry the same number while the host is part
  -- way through renaming them, which is why RoundCard keys on the index too.
  round_index integer not null check (round_index >= 0),
  court_index integer not null check (court_index >= 0),
  team1       integer not null check (team1 >= 0 and team1 <= 99),
  team2       integer not null check (team2 >= 0 and team2 <= 99),
  created_at  timestamptz not null default now()
);

create index if not exists score_edits_share_idx
  on public.score_edits (share_key, id);

alter table public.score_edits enable row level security;

-- No policies for anon at all. Everything a watcher does goes through the
-- function below; the table itself is unreadable and unwritable from outside.
-- The host reads its own through a policy, because the host is authenticated
-- and owns the share the rows hang off.
drop policy if exists score_edits_select on public.score_edits;
create policy score_edits_select on public.score_edits
  for select to authenticated using (
    exists (
      select 1 from public.shared_sessions s
      where s.share_key = score_edits.share_key
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists score_edits_delete on public.score_edits;
create policy score_edits_delete on public.score_edits
  for delete to authenticated using (
    exists (
      select 1 from public.shared_sessions s
      where s.share_key = score_edits.share_key
        and s.user_id = (select auth.uid())
    )
  );


-- The one way a score gets in from outside. Checks the code itself rather than
-- trusting a caller that says it already did, because a caller that says so is
-- exactly what somebody skipping the code would write.
--
-- Returns true if it was taken. False covers a wrong code, an expired share and
-- a key that never existed, identically and on purpose.
create or replace function public.submit_score_edit(
  key text,
  code text,
  round_index integer,
  court_index integer,
  team1 integer,
  team2 integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  held integer;
begin
  if not public.share_code_ok(key, code) then
    return false;
  end if;

  -- A queue nobody is draining is the failure worth bounding here: a host whose
  -- phone is in a bag collects whatever anyone cares to send. Two hundred is far
  -- more than an afternoon of honest corrections and still a bounded table.
  select count(*) into held from public.score_edits e where e.share_key = key;
  if held >= 200 then
    return false;
  end if;

  insert into public.score_edits
    (share_key, round_index, court_index, team1, team2)
  values
    (key, round_index, court_index, team1, team2);

  return true;
end;
$$;

revoke all on function public.submit_score_edit(text, text, integer, integer, integer, integer)
  from public;
grant execute on function public.submit_score_edit(text, text, integer, integer, integer, integer)
  to anon, authenticated;


-- Tell PostgREST the schema moved, or both functions are a 404 until the API
-- happens to reload on its own.
notify pgrst, 'reload schema';
