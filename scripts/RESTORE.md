# Restoring the database

Read this once before you need it. A backup nobody has restored is a guess.

## What a dump contains

`backup-db.sh` writes `auth.users`, then the whole `public` schema, which is the
four tables holding groups, players, preferences and profiles, then a replay of
the triggers on `auth.users`.

It is three pieces for three reasons, and each one was learned the hard way.

**Users come first** because every row in `public` is keyed by `user_id` against
`auth.users`. A dump of `public` alone restores data belonging to accounts that
no longer exist, into a database nobody can sign in to. Loading the children
before the parent also just fails, on every foreign key at once.

**It is two `pg_dump` runs, not one.** The obvious single command,
`--schema=public --table=auth.users`, dumps `auth.users` **only**: once any
`--table` pattern is given, `--schema` stops selecting anything. That is
documented behaviour and it is silent. The first backup this project ever took
was exactly that, and it was a complete, valid, well formed dump of three user
rows and none of their data.

**The triggers are replayed at the end** because `pg_dump` emits them with
`auth.users`, where they call functions that live in `public` and do not exist
yet. Postgres reports the error and carries on, so the restore looks fine while
losing `on_auth_user_created`, which is what writes a profile row when someone
signs up. Existing users would be fine and every new signup would get nothing.

## What a dump does not contain

- Anything else in the `auth` schema: sessions, refresh tokens, identities,
  audit log. **Everyone is signed out after a restore** and has to ask for a
  new code. That is acceptable and worth knowing in advance.
- Storage objects, edge functions and project settings. This app uses none.
- `auth.uid()` and the rest of the `auth` schema's functions. Supabase provides
  those, so a restore into a real Supabase project has them already.

## Proving a dump is good

Two levels, and they answer different questions.

**The quick one, and it is one command:**

```
./scripts/verify-restore.sh
```

It builds a throwaway Postgres on this machine, restores the newest dump into
it, checks the row counts, the foreign keys, the RLS policies and whether a new
signup still gets a profile, then deletes the lot. It never touches the live
database and never needs its password. It takes about ten seconds, and it is
what caught both of the failures described above.

Run it after any change to `backup-db.sh`, and every so often on a real backup.

**The thorough one, below.** It additionally proves a restored user can still
sign in from the app. Worth doing once. It needs the Supabase dashboard.

## Restoring into a scratch project, which is the thorough test

1. Create a new Supabase project. Any region, free tier is fine.
2. Do **not** run the migrations first. The dump carries the tables, the
   policies and the triggers, and pre-creating them only produces collisions.
   The migrations in `supabase/migrations/` are the source of truth for a
   *fresh* database, not for a restore.
3. Get the new project's connection string, then load the dump:

   ```
   gzip -dc pbrr-<stamp>.sql.gz | /opt/homebrew/opt/libpq/bin/psql "<scratch-connection-string>"
   ```

   The full path is deliberate. Homebrew keeps `psql` off the PATH so it cannot
   collide with a full Postgres install, so the bare command will say "not
   found" even though it is installed.

4. Expect two complaints and no more: `schema "public" already exists`, and one
   about `handle_new_user()` not existing, from the trigger in its first
   position. Both are normal. Anything else naming a *missing* object is not.

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
