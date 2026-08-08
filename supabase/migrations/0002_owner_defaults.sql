-- ============================================================================
-- 0002_owner_defaults.sql
--
-- Let the server fill in the owner of a row.
--
-- 0001 left user_id with no default, so every insert had to name it or the
-- with-check policy rejected the row with a bare 42501. That was verified
-- against the live project on 2026-08-08: an insert omitting user_id returns
-- HTTP 403. Correct, but it turns one forgotten field in the sync code into a
-- runtime error rather than something the database can answer for itself.
--
-- This changes no security property. The policies from 0001 are untouched and
-- still decide who may write what; a client that sends an explicit user_id
-- belonging to someone else is refused exactly as before. The default only
-- supplies the right answer when the client says nothing.
--
-- auth.uid() is called bare rather than wrapped in a select. The
-- (select auth.uid()) idiom exists to let the planner cache the value across
-- rows in a policy; a column default is not a policy and Postgres does not
-- permit a subquery there.
-- ============================================================================

alter table public.profiles     alter column user_id set default auth.uid();
alter table public.rosters      alter column user_id set default auth.uid();
alter table public.players      alter column user_id set default auth.uid();
alter table public.preferences  alter column user_id set default auth.uid();
