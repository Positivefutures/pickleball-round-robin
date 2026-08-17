-- ============================================================================
-- 0008_round_plan.sql
--
-- Carry the host's per-round game plan on the account.
--
-- Run it once, whole, in the Supabase SQL Editor, and run it BEFORE deploying
-- the client that goes with it. It adds a column to preferences, and a client
-- that sends round_plan to a table that has not got it yet gets PGRST204:
-- PostgREST rejects the whole preferences row, so every signed-in user loses
-- all preference sync until the column exists. Same hazard, and the same
-- ordering, as swap_hint_dismissed in 0006 and scoring_enabled at the end of
-- 0005.
--
-- Why it is here at all. "Special Game Types" used to be three settings and a
-- frequency each — gendered every 4 rounds — and the app worked out which
-- rounds those landed on. The host now says it directly: one row per round,
-- each set to Normal, Gendered, Mixed or Equal Skill. That is an array, one
-- entry per round from round 1, with null for an ordinary round robin, so it
-- is stored as a json array rather than the object special_types holds.
--
-- Default '[]' rather than a plan, matching stores.roundPlan's empty plan. An
-- account that has never sent one reads back as "every round ordinary", and
-- the local migration in src/lib/migrations.ts derives the real plan from the
-- special_types the device already holds, so nobody's afternoon changes shape
-- on upgrade.
--
-- special_types is deliberately left in place and still written by the client
-- for this one release. A rollback to the previous build then still finds the
-- host's frequency settings where it left them.
-- ============================================================================

alter table public.preferences
  add column if not exists round_plan jsonb not null default '[]'::jsonb;

-- The client plans 16 rounds and each entry is one short word, so a real plan
-- is a couple of hundred bytes. The cap is the same kind of belt as the one
-- 0003 puts on special_types: it is not a business rule, it is a limit on what
-- a hand-written PostgREST call can park in somebody's row.
alter table public.preferences
  drop constraint if exists preferences_round_plan_size;
alter table public.preferences
  add constraint preferences_round_plan_size check (octet_length(round_plan::text) <= 8000);


-- Tell PostgREST the schema moved, or the new column is invisible to the API
-- until it happens to reload on its own.
notify pgrst, 'reload schema';
