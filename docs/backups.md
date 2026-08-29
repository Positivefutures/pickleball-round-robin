# Backups

How the app's data is protected, what you have to do, and what to do when
something goes wrong. Written to be read by whoever is administering the app,
which today is Jeff.

---

## The short version

Once a week, open Terminal and run two commands:

```
cd ~/Developer/pickleball-round-robin
./scripts/backup-db.sh
```

That is the whole routine. Everything below explains why it exists and what to
do if you ever need it.

---

## Why the app needs this at all

The app keeps two copies of everyone's data.

**On the phone.** Groups and players are saved in the browser on each person's
own device. This is the copy people actually use, and it works with no internet
and no account.

**On the server.** If someone signs in, their data is also copied to a database
run by Supabase, so it can appear on their other devices.

The Supabase copy is the one at risk. It is a single database on somebody else's
computer, and **Supabase's free plan takes no backups of it.** That is not a
setting anyone forgot to switch on. Automatic daily backups begin on their paid
plan. Until this app is on that plan, the only copy of that database is the one
you make yourself.

### The reassuring part

If that database vanished tomorrow, it would not be a catastrophe.

The app is built local-first, which means each phone treats its own copy as the
real one. When a device next syncs and finds the server missing its groups, it
uploads them again. So a total loss of the server would gradually repair itself
from whichever devices are still in use.

**What would not come back** is data belonging to someone who has since deleted
the app, changed phone, or cleared their browser. Their phone was the only other
copy, and it is gone. That is who backups are really for.

This is why backups matter but are not an emergency. It is worth doing properly.
It is not worth paying for a fancier plan yet.

---

## What a backup actually is

Running the command produces one file, roughly like this:

```
pbrr-20260809T133033Z.sql.gz
```

The name is the date and time in UTC, so files sort into order automatically.
It is a compressed text file containing the instructions to rebuild the database
from nothing: every table, and every row in it.

### What is inside

- **The accounts.** Email addresses and account IDs, so a restored database
  knows who its users are.
- **The four tables of app data.** Groups, players, preferences and profiles.

Both halves are needed. Every group and player is stamped with the ID of the
account that owns it. Restore the app data without the accounts and you get a
database full of groups belonging to people who do not exist, that nobody can
sign in to see.

### What is not inside, on purpose

- **Sessions.** After a restore, everyone is signed out and has to request a new
  code by email. Their data is intact; they just have to sign in again. Worth
  knowing before it happens so it does not look like the restore failed.
- **Passwords.** There are none. This app only ever emails a code.
- **The app itself.** The code lives in GitHub, which is its own backup.

---

## Where the files go

```
Dropbox/AI PROJECTS - DROPBOX/pickleball-backups/
```

Deliberately **outside** the app's folder, for two reasons. The app's folder is
published publicly on GitHub, and these files contain real people's email
addresses. And being in Dropbox means each backup is copied off your Mac within
seconds of being made, which is what makes it a backup rather than a second copy
on the same hard drive.

**The last 30 are kept and older ones are deleted automatically.** Not unlimited,
because a folder of old files full of real names and email addresses is a
liability, not an asset.

---

## How often to run it

**Weekly is right for now.** There are three accounts and the data changes
slowly, so a week of loss would be a week of small inconvenience.

Increase it as the app grows. Once there are real groups run by people who are
not you, move to daily, and at that point it is worth reconsidering whether
Supabase's paid plan is simpler than remembering. Running it before any change
to the database is also sensible, and costs nothing.

There is deliberately **no automatic schedule yet.** The obvious free way to
automate it is a scheduled job on GitHub, but this project's repository is
public, and files produced by public GitHub jobs can be downloaded by anyone.
Automating it safely means either encrypting the files first or paying for
somewhere to put them. Neither is hard, and neither is worth doing before there
is more than one person's data in there.

---

## Checking a backup is real

This is the part that matters most, and it is the part almost everyone skips.

A backup that has never been restored is a guess. It can be the right size, the
right shape, and completely worthless. **That is not hypothetical: the first
backup this app ever took reported success and contained none of the app's
data.** It held the three accounts and nothing else. Two separate faults, both
silent, and nothing caught them except actually restoring the file and counting
what came out.

So there is a second command:

```
./scripts/verify-restore.sh
```

It takes about ten seconds. It builds a temporary, empty database on your Mac,
restores the newest backup into it, checks the result, then deletes the whole
thing. **It never touches the live database** and never needs its password. It
only reads a file.

A good backup looks like this:

```
Rows restored:
  auth.users             3
  public.players         62
  public.preferences     3
  public.profiles        3
  public.rosters         13

Rows pointing at an owner or group that is missing: 0
Row level security: 16 policies, 0 tables left unprotected
New signups still get a profile row: yes
One account still cannot fill the database: yes

PASS
```

If it says `PASS`, that backup has been proven to work, not assumed to.
If it says `FAIL`, it says what was wrong. Do not rely on that file.

**Run this occasionally, not every time.** Once a month, and always after anyone
changes how the app stores data.

### What those lines mean

- **Rows restored.** How many accounts, groups and players came back. Compare
  with what you expect. Zero anywhere is a red flag.
- **Rows pointing at an owner or group that is missing.** Should always be 0. Any
  other number means some groups or players came back orphaned, belonging to
  nobody.
- **Row level security.** The rules stopping one user reading another user's
  groups. `0 tables left unprotected` is what you want. If a restore lost those
  rules, the data would be readable by the wrong people.
- **New signups still get a profile row.** The app runs a small automatic step
  whenever somebody new signs up. It was quietly being lost in restores, which
  would have meant every new signup after a restore silently half-working. This
  line is there because that bug happened.
- **One account still cannot fill the database.** There are limits on how much
  any single account can store, so nobody can use up the free allowance on
  everyone else's behalf. Same failure shape as the line above: a restore that
  dropped them would look perfect and serve everyone their data. Note that a
  backup taken before 2026-08-09 predates those limits and will fail this line
  honestly. Its data is fine. Restoring one means running
  `supabase/migrations/0003_row_caps.sql` afterwards.

---

## When something goes wrong

Full instructions are in [scripts/RESTORE.md](../scripts/RESTORE.md). This is
the shape of it, so the real thing is not the first time you have seen it.

**Before restoring anything, stop and think.** Because the app is local-first,
devices still in use will re-upload their own groups on their next sync.
Restoring a week-old backup over a database that healthy devices are still
repairing can undo more than the original problem did. Restore when data is
genuinely gone, not when something looks odd.

If it is genuinely gone:

1. **Turn accounts off first.** In `src/lib/appInfo.ts`, set `ACCOUNTS_ENABLED`
   to `false` and deploy. This hides sign-in entirely, so nobody syncs into a
   half-restored database while you work. The app still works completely without
   an account, so nobody is stranded.
2. **Restore the backup** by following `scripts/RESTORE.md`.
3. **Turn accounts back on** and deploy.
4. **Expect everyone to be signed out** and to need a new code by email. Tell
   them, if you can.

This is a job to do with Claude rather than alone. The steps are short but each
one is easy to get subtly wrong, and the whole point of the exercise is not to
make things worse.

---

## The password

The first run asked for the database connection string and stored it in your
Mac's **Keychain**, the same place Safari keeps passwords. It is not in a file,
not in the app's code, and not on GitHub.

Every run since then finds it there and asks nothing.

**If you ever change the database password** in the Supabase dashboard, the
backup will start failing with a message about authentication. Clear the stored
one and it will ask again next time:

```
security delete-generic-password -s pbrr-supabase-db
```

**If you ever paste a password somewhere it should not go** — a chat window, a
screenshot, an email — change it in the Supabase dashboard under Settings →
Database. That makes the exposed one useless. This has already happened once and
took two minutes to put right.

---

## What is installed, and why

Two pieces of Postgres software, both added by Claude, neither of which runs in
the background or slows anything down:

- **`libpq`** — the tools that talk to the database. Needed to make a backup.
- **`postgresql@17`** — a full database server, used only by the verify command
  to build its temporary throwaway database. Deliberately **not** set to run at
  startup.

If you ever move to a new Mac, install both with `brew install libpq
postgresql@17`, then run the backup command and paste the connection string when
it asks.

---

## Honest limitations

Worth knowing, so none of this is a surprise later:

- **It only runs when you remember.** There is no schedule. A backup you forget
  to take protects nothing.
- **It has not been restored into a real Supabase project yet.** The verify
  command proves the data survives and the database works. It does not prove a
  restored user can sign in through the app and see their groups. That test is
  still on the launch checklist, and is worth doing before there is real data
  from real people to lose.
- **It captures a moment.** Anything created between the last backup and a
  failure is only on the devices that hold it.
- **A backup outlives a deletion, for a while.** Since 2026-08-09 anybody can
  delete their own account from the app, and it goes from the live database
  straight away. Backups taken before that day still hold it, so a restore would
  bring it back. That is normal and it is what the 30-file limit is for: keep
  taking backups and the old copies fall off the end on their own. If somebody
  ever asks for their data to be gone everywhere, the honest answer is that it
  is out of the app now and out of the backups within a month.

---

## Summary card

| Task | Command | How often |
|---|---|---|
| Take a backup | `./scripts/backup-db.sh` | Weekly, daily once the app is busy |
| Prove a backup works | `./scripts/verify-restore.sh` | Monthly |
| Restore | See [scripts/RESTORE.md](../scripts/RESTORE.md) | Only when data is genuinely lost |

Both commands are run from the app's folder:

```
cd ~/Developer/pickleball-round-robin
```
