-- ============================================================================
-- 0006_swap_hint.sql
--
-- Carry "I have read the swap hint" on the account instead of on the phone.
--
-- Run it once, whole, in the Supabase SQL Editor, and run it BEFORE deploying
-- the client that goes with it. It adds a column to preferences, and a client
-- that sends swap_hint_dismissed to a table that has not got it yet gets
-- PGRST204: PostgREST rejects the whole preferences row, so every signed-in
-- user loses all preference sync until the column exists. Same hazard, and the
-- same ordering, as scoring_enabled at the end of 0005.
--
-- Why it is here at all. The hint is a green banner above the courts saying how
-- to swap two players, with a ✕ that closes it for good. Closing it was kept in
-- localStorage, which is per browser, so a host who plays on a phone and sets
-- up on a laptop was told twice, and a new phone told them again. It is a thing
-- a person learns once, not a thing a device learns once, so it belongs beside
-- large_text: a preference of theirs, on their account.
--
-- Default false, matching stores.swapHintDismissed, so every existing account
-- reads back exactly what it has now — nobody who has already closed it has it
-- reopened by this, because their device still says so and the client only ever
-- moves this flag one way.
-- ============================================================================

alter table public.preferences
  add column if not exists swap_hint_dismissed boolean not null default false;


-- Tell PostgREST the schema moved, or the new column is invisible to the API
-- until it happens to reload on its own.
notify pgrst, 'reload schema';
