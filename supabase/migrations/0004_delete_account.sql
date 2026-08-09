-- ============================================================================
-- 0004_delete_account.sql
--
-- Let somebody delete their own account, and everything held under it.
--
-- This is the one thing in the app that needs privilege the browser does not
-- have. The account row lives in auth.users, which the publishable key cannot
-- touch at all, so the deletion has to happen inside the database. There is no
-- server tier here to hold an admin key, and adding one for a button nobody
-- presses twice would be the most expensive way to answer this.
--
-- So: one security definer function, taking no arguments, deleting exactly the
-- caller.
--
-- Everything else follows from the foreign keys already in 0001. profiles,
-- rosters, players and preferences all reference auth.users(id) on delete
-- cascade, and so do Supabase's own auth tables — identities, sessions,
-- one_time_tokens, mfa_factors and the rest. Confirmed against the live
-- database on 2026-08-09: every foreign key pointing at auth.users cascades,
-- and refresh_tokens cascades from sessions. Deleting the one row is therefore
-- the whole job, and nothing here has to enumerate tables that a later
-- migration might add to.
-- ============================================================================


-- ------------------------------------------------------------ the safeguards --
-- A security definer function runs as its owner, which here is `postgres`: not
-- a superuser, but it does hold BYPASSRLS and DELETE on auth.users, which is
-- exactly why this function exists and exactly why it is worth being careful
-- with. Four things keep it narrow:
--
--   1. **It takes no arguments.** There is no user id to pass, so there is
--      nothing to aim at somebody else. The only account it can ever delete is
--      the one whose token is on the request. That is the whole security model,
--      and it is structural rather than a check that could be got round.
--   2. **auth.uid() is read once, into a local.** It comes from the verified
--      JWT, so it cannot be spoofed by a client that simply asks nicely.
--   3. **Empty search_path, everything schema qualified.** Supabase's standing
--      guidance for definer functions, and the reason `handle_new_user()` in
--      0001 is written the same way. Without it, a caller who could create a
--      table named `users` in a schema earlier on the path could redirect the
--      delete.
--   4. **Execute is granted to `authenticated` only.** Postgres grants EXECUTE
--      to PUBLIC on a new function by default, so the revoke below is doing
--      real work rather than being decorative. A signed-out visitor would fail
--      the null check anyway; both are here because the two failures are
--      independent, and the day one of them is edited the other still holds.
create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller  uuid;
  deleted uuid;
begin
  caller := (select auth.uid());

  -- Nobody signed in. 42501 is insufficient_privilege, which PostgREST turns
  -- into a 403 rather than a 500, so a signed-out call reads as refused rather
  -- than as the server falling over.
  if caller is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  delete from auth.users where id = caller returning id into deleted;

  -- False rather than an error when there was nothing to delete. Two devices
  -- pressing the button together is a real thing, and the second one has got
  -- what it asked for: the account is gone. Raising there would show a failure
  -- for an action that succeeded, which is the worse of the two lies.
  return deleted is not null;
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;


-- Tell PostgREST the schema moved, or the function is a 404 until the API
-- happens to reload on its own.
notify pgrst, 'reload schema';
