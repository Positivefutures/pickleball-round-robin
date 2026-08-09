# Restoring the database

Read this once before you need it. A backup nobody has restored is a guess.

## What a dump contains

`backup-db.sh` writes the `public` schema, which is the four tables holding
groups, players, preferences and profiles, plus the `auth.users` table.

Users are included on purpose. Every row in `public` is keyed by `user_id`
against `auth.users`, so a dump of `public` alone restores data belonging to
accounts that no longer exist, into a database nobody can sign in to.

## What a dump does not contain

- Anything else in the `auth` schema: sessions, refresh tokens, identities,
  audit log. **Everyone is signed out after a restore** and has to ask for a
  new code. That is acceptable and worth knowing in advance.
- Storage objects, edge functions and project settings. This app uses none.
- The migrations in `supabase/migrations/`. Those live in git, which is the
  right place for them, and a restore into an empty project needs them run
  first. See below.

## Proving a dump is good

Two levels, and they answer different questions.

**The quick one, run against a throwaway database on this machine.** It proves
the file is complete, loads without error, and still holds every row. That is
the failure that actually happens: a dump that was silently truncated months
ago. Claude can run this unattended once a dump exists, so ask for it.

**The thorough one, below.** It additionally proves a restored user can still
sign in and see their groups. Worth doing once. It needs the Supabase dashboard.

## Restoring into a scratch project, which is the thorough test

Do this once now, while nothing depends on it.

1. Create a new Supabase project. Any region, free tier is fine.
2. Run `supabase/migrations/0001_accounts.sql` then `0002_owner_defaults.sql`
   in its SQL editor, in that order. This gives you the tables, the RLS
   policies and the triggers.
3. Get the new project's connection string, then load the dump:

   ```
   gzip -dc pbrr-<stamp>.sql.gz | /opt/homebrew/opt/libpq/bin/psql "<scratch-connection-string>"
   ```

   The full path is deliberate. Homebrew keeps `psql` off the PATH so it cannot
   collide with a full Postgres install, so the bare command will say "not
   found" even though it is installed.

4. Expect complaints. `auth.users` already exists in a fresh project and the
   dump will collide with rows the new project created for itself. Errors that
   name an existing object are fine. Errors that name a missing one are not.

5. Verify with counts, not vibes:

   ```sql
   select
     (select count(*) from auth.users)         as users,
     (select count(*) from public.rosters)     as groups,
     (select count(*) from public.players)     as players,
     (select count(*) from public.preferences) as prefs;
   ```

   Compare against the live project. They should match.

6. Then prove the thing that actually matters. Point a local build at the
   scratch project by changing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   in `.env.local`, sign in as a restored user, and confirm their groups are
   there. A row count proves the data landed. Only signing in proves it is
   still reachable by the person it belongs to.

7. Delete the scratch project when you are done. It holds real names and
   email addresses.

## Restoring over the live project

Only if the live data is genuinely lost. The app is local-first, so before
doing anything destructive, remember that any device still holding its groups
will push them back up on its next sync. Restoring stale rows over devices that
are still healthy can do more damage than the original loss.

If you are sure:

1. Put the app into a safe state first. Set `ACCOUNTS_ENABLED = false` in
   `src/lib/appInfo.ts` and deploy, so nobody syncs into a half-restored
   database while you work.
2. Restore as above.
3. Turn accounts back on and deploy.
4. Expect every user to be signed out and to need a fresh code.
