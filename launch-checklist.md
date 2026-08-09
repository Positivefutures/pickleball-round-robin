# Launch Checklist

What still has to be true before marketing this app widely.

Ordered by risk and dependency, so working top down is always the right move.
Tick items as they land. When the question is "what should I work on next?",
the answer is the first unticked box.

Tags: **[Jeff]** for work in a dashboard the agent cannot reach, **[me]** for
code, **[both]** for a handoff.

Last reviewed against the code and the live site: 2026-08-09, at `1.9.7`.

---

## Already done

- [x] Row Level Security on all four tables
- [x] Accounts and cross-device sync, phases 0 through 4
- [x] Vercel analytics, traffic level
- [x] Feedback capture. Suggest a Feature and Report a Bug both ship
      diagnostics. See `src/lib/feedback.ts` and `FeedbackPanel.tsx`
- [x] Guest mode. No account is needed to use the app. That is the default
      path, and the one the test suite exercises
- [x] Share previews. Fifteen `og:` and `twitter:` tags, verified against the
      live host, and the banner survives the iOS square crop
- [x] Empty-state guidance. "Add your first player!" in `RosterPage.tsx`
- [x] A kill switch. `ACCOUNTS_ENABLED` in `src/lib/appInfo.ts` hides the whole
      accounts feature without a rollback

---

## Facts worth knowing before working any item

**There is no server.** This is a Vite and React SPA. No `api/` directory, no
`vercel.json`, no serverless function anywhere. The browser talks straight to
Supabase with the publishable key, and RLS is the whole of the protection.
Anything needing privilege the browser lacks goes in a `security definer`
Postgres function, following the pattern `handle_new_user()` sets in
`supabase/migrations/0001_accounts.sql`. Keeping it this way is why the app
costs nothing to run under load.

**A wiped database is survivable.** `planMerge()` unions local and server
state and pushes up whatever the server lacks, so a device still holding its
groups restores them on the next sync. Deletion only travels by explicit
tombstone. Backups still matter for the user who lost their phone, but this is
not a business-ending risk, so do not over-buy against it.

**Traffic itself is close to free.** A static bundle on a CDN. The only surface
that scales with users is Supabase, so that is where the attention belongs.

---

## Tier A. Do first. All cheap, all high regret if skipped.

### 1. Name clearance search **[both]** DONE 2026-08-08

- [x] Search CIPO, USPTO, the Apple and Google app stores, and the open web
- [x] Write the findings down, even if clean, so this is never re-litigated
- [x] Decision: no rename. There is no conflict to act on

**Legally clear.** Searched TMview, which aggregates both USPTO and CIPO,
across Nice classes 9, 41 and 42.

- Nothing in either register combines "pickleball" with "round robin".
- "pbroundrobin" returns nothing at all, in either register.
- The one live registered `ROUNDROBIN` word mark is Sahara 23 LLC: Canada
  TMA1193992, registered 2023-08-09, expiring 2031, classes 9, 38 and 42, plus
  a pending US application 90502886. It is roundrobin.com, a privacy and
  identity product covering email forwarding, anonymous search and dark web
  scanning. Different goods, and no plausible confusion with a tool that draws
  up pickleball games.
- The earlier US `ROUNDROBIN` (ILATANET, 85543493) is dead, status "Ended".
- Canada has 49 live pickleball marks. All are clubs, leagues, facilities and
  apparel. None is a scheduling tool.

**Why it is clear is also the catch.** "Round robin" is the generic term for
the format. That is why nobody owns it, and equally why we cannot. A purely
descriptive name is not registrable without acquired distinctiveness, so
pursuing registration for the phrase is not worth the money. If a registrable
mark is ever wanted, it is the robin, or a coined word, not this phrase.

**Commercially crowded, which is the real finding.** Twenty-five apps answer
"pickleball round robin" in the App Store, on both the US and Canadian
storefronts. Direct name collisions already shipping: Pickleball Round Robin
Maker, Dink! Pickleball Round Robins, My Round Robin, Round Robin Assistant,
Round Robin Rumble, All-Play-All Round Robin. There is also a Robin Pickleball,
which is worth knowing given our mascot. On the web, `pickleballscheduler.app`
is positioned almost identically. `pickleballroundrobin.com` is registered to
someone else and serves an empty page.

**What follows from this.** No rename, and no letter is coming. But the name
will not pick this app out of a list of twenty-five, so the assets that
actually distinguish it are the robin and `pbroundrobin`. Lean on those in
item 21, and do not expect the name to do any work.

### 2. Point the bare domain at the app **[Jeff]** DONE 2026-08-09

- [x] Add `pbroundrobin.com` and `www.pbroundrobin.com` to the Vercel project,
      redirecting to `app.pbroundrobin.com`
- [x] Confirm both return a redirect, not a 404

Both are attached to the project as **307 temporary** redirects. Temporary and
not permanent on purpose: item 20 puts a real landing page at the apex, and a
cached 308 would keep bouncing returning visitors to the app long after the
redirect was removed.

The apex needed no DNS change. Its A record already pointed at Vercel's anycast
address, and the 404 was `DEPLOYMENT_NOT_FOUND` from Vercel's own edge, meaning
the domain simply was not attached to a project. `www` had no record at all and
got a new CNAME at Namecheap, which is where the domain and its nameservers
live.

Verified 2026-08-09: apex and `www` both return 307 to
`https://app.pbroundrobin.com/`, the apex resolves through in one hop to the
real app, and `app.` still returns 200 and is unchanged.

### 3. Raise the sign-in email ceiling **[both]** PART DONE

- [x] Confirm the real Resend send limit. **100 a day, 3,000 a month**
- [x] Confirm the Supabase auth rate limit. **30 emails an hour**
- [x] Make a throttled send read differently from a wrong address in the UI
- [x] Write `ACCOUNTS_ENABLED` into the runbook as the rollback if this goes bad
- [x] **Raise the Supabase hourly cap.** Raised from 30 to **100 an hour** on
      2026-08-09
- [ ] Decide whether Resend's 100 a day is worth paying to lift

Sign-in is a six-digit code by email. It fails quietly, which is what makes it
the most likely thing to break first.

**The ceiling has moved.** It used to be Supabase at 30 an hour, which a single
Facebook group post could exhaust. With that raised to 100, the binding
constraint is now Resend's **100 a day**, and unlike the last one this one
costs money to lift. One busy day is now the failure case rather than one busy
hour, which is roughly a tenfold improvement for no spend.

Worth knowing before paying: the app works without an account, and the copy now
says so when a send is refused. The ceiling degrades the product, it does not
break it.

The code half is done. Two different failures used to give the same wrong
answer, "wait a minute":

- The **per-address cooldown** now repeats the real number Supabase names, so
  someone who taps twice is told to wait 41 seconds rather than a vague minute.
- The **project ceiling** now says plainly that we cannot send, and points out
  that the app needs no account. That last part matters more than the apology.
  Anyone blocked at the ceiling did nothing wrong and can still run their whole
  session, so a dead end there loses a user for no reason.

Detection reads the error's `code` and `status` rather than its English, since
the prose is Supabase's to reword and the code is not.

---

## Tier B. Data safety, and being able to see what is happening.

### 4. Backups **[both]** PART DONE

**Plain-language guide: [docs/backups.md](docs/backups.md).** That is the one to
read when administering the app. What follows is the engineering detail.

- [x] Script a `pg_dump` to external storage. `scripts/backup-db.sh`
- [x] Write the restore procedure down. `scripts/RESTORE.md`
- [x] Install the Postgres client tools, `brew install libpq`
- [x] Run it for real. First good dump: `pbrr-20260809T133033Z.sql.gz`
- [x] Prove the dump restores. `scripts/verify-restore.sh`, one command, and it
      passes on the current dump and fails on the broken one
- [ ] Once: the full restore test into a scratch Supabase project, which is the
      only thing that proves a restored user can still sign in **from the app**
- [ ] Decide whether to automate the schedule, and whether Supabase Pro is
      worth it for daily backups

There are no automated backups today. That is a Pro feature, not something to
verify.

The script dumps `public` **and** `auth.users`, which is the part that is easy
to get wrong: every row is keyed by `user_id`, so dumping `public` alone
restores data belonging to accounts that no longer exist.

**Two failures got through the first time, and only a real restore found them.**
The single command `--schema=public --table=auth.users` dumps `auth.users` only,
because `--table` makes `--schema` select nothing, so the first backup held
three user rows and none of their data. And `pg_dump` emits the triggers on
`auth.users` before the functions they call exist, so a restore quietly loses
`on_auth_user_created` and every new signup after it gets no profile row.

Both now have a named check that fails the backup rather than a comment saying
to watch out. The completion-marker check that was supposed to catch this passed
happily on the empty dump, because that dump really was complete.

Dumps land in a sibling folder outside the repository, which puts them inside
Dropbox and therefore off this machine within seconds. The last 30 are kept and
older ones pruned, since they hold real names and addresses and old copies are
a liability rather than an asset.

**Automation is deliberately not done yet.** The repository is public, and
GitHub Actions artifacts on a public repository are downloadable by anyone, so
the obvious free schedule is the one option that is actually unsafe. Automating
means either encrypting before upload or paying for storage. Worth revisiting
once there are enough real accounts to justify it; today the local-first design
means any device still holding its groups restores them on the next sync.

The script asks for the connection string once and keeps it in the macOS
Keychain, so the password is never in a file, never in the shell history and
never in the repository. It also finds `pg_dump` on its own, because Homebrew
installs it off the PATH and no backup should require editing a shell config.

Note for item 10: backups in Dropbox make Dropbox a processor, so it belongs in
the privacy policy's list. So does the Keychain, in the sense that it is worth
knowing where the credential lives.

### 5. Billing caps, and the upgrade trigger **[Jeff]** DONE 2026-08-09

**Plain-language guide: [docs/costs-and-limits.md](docs/costs-and-limits.md).**
That is the one to read. What follows is the reasoning behind it.

- [x] ~~Set spending caps~~ **There are none to set.** Both spend controls are
      paid-plan features, and neither free plan can bill you
- [x] Write down what happens at each free ceiling. Vercel stops the feature for
      30 days. Supabase warns, allows a grace period, then refuses requests
- [x] Pick the number that triggers an upgrade. Supabase Pro at 70% of any
      allowance, or the second inactivity pause. Vercel Pro on the day the app
      charges anyone for anything
- [x] **The donate button is fine.** Vercel's own note: "Asking for Donations
      does not fall under commercial usage." No payment moves on a Vercel-hosted
      page either, since the panel links out to Ko-fi
- [x] Confirm in both dashboards that neither account has drifted onto a paid
      plan. Both still free, checked 2026-08-09
- [x] Decide what to do about the inactivity pause. **Live with it and watch for
      the warning email.** Revisit when there are real groups run by strangers,
      at which point Pro buys the daily backups as well as the uptime

**The premise of this item was wrong, and finding that out is most of its
value.** It was written to prevent a surprise bill. A surprise bill is not
possible: Vercel Hobby has no billing cycle, and Supabase's free plan states
that it does not charge. The exposure is downtime, not money.

**The usage ceilings are nowhere near.** Measured 2026-08-09: 10.7 MB of the
500 MB database allowance, and only 224 KB of that is app data. The rest is
Postgres's own furniture. That works out to roughly 75 KB an account, so the
allowance holds several thousand of them. Three accounts against a 50,000 limit.
Nobody should spend money against these numbers.

**What will actually break is the opposite of overuse.** Supabase pauses a free
project that sees too little database activity across 7 days. Sign-in, sync and
the backup script all stop together, while the app itself keeps working for
everyone who never signed in. So it fails quietly and mostly invisibly. Supabase
warns by email about a week ahead and again once it has happened, and resuming
is one click in the dashboard.

That leaves a decision. Live with it and watch for the email, keep the project
warm with a small daily request, or pay the $25 for Pro, where projects are
never paused. Pro also brings the daily backups that
[docs/backups.md](docs/backups.md) is currently standing in for, which makes it
the better argument for upgrading than any quota on this page.

**For item 22, if subscriptions ever happen:** charging for anything puts this
outside Vercel Hobby's terms outright, so Vercel Pro at $20 a month becomes
mandatory rather than optional. Selling through Ko-fi rather than taking
donations does the same. Both together are $45 a month.

### 6. Prove RLS with two real accounts **[me]** DONE 2026-08-09

- [x] A script that signs in as two accounts using the publishable key
- [x] Attempt cross-account read, update and delete on all four tables
- [x] Assert every one of them fails
- [x] Prove the test itself can fail, with `--self-test`

```
node scripts/prove-rls.mjs              # 43 checks, 0 failed
node scripts/prove-rls.mjs --self-test  # 4 checks, 4 red, which is the pass
```

**43 checks, all green.** The policies were right, and now that is measured
rather than read. Run it again after any change to the migrations.

It creates two throwaway accounts on the live project, has one try every route
it can think of to the other's data, then deletes both. The service role key
bypasses RLS entirely, so it appears nowhere in the file. Everything runs with
the publishable key that already ships in the browser bundle, which is exactly
what an attacker has.

What it tries, on all four tables: read, count, update, delete, insert a row
owned by the other account, and the subtle one, edit its own row to reassign
`user_id` and hand it away. Then the same again as a signed-out visitor. Then
six positive controls proving the owner can still do everything the intruder
could not.

**Two traps this had to avoid, both of which would have produced a green run
that meant nothing.**

PostgREST answers an update or delete aimed at rows it cannot see with success
and an empty body. So "no error was raised" is not evidence of anything, and
every attempt asserts on the rows actually returned instead.

And a suite where every call failed for a dull reason, a mistyped table name,
would print the same wall of `ok` as a perfect result. That is what the positive
controls are for, and it is why `--self-test` exists. That builds a table with
`using (true)` policies, the classic mistake of switching RLS on and then
letting every signed-in user reach every row, aims the same probes at it, and
insists all four go red. It does. The decoy holds nothing but probe rows and is
dropped straight after, so no real data is exposed while it stands.

Verified afterwards that the database is byte for byte as it started: four
tables, three users, thirteen groups, sixty-two players, no decoy, no probes.

### 7. Cap what one account can create **[me]** DONE 2026-08-09

- [x] A trigger with per-user row counts on `players` and `rosters`
- [x] Set generously, so no real user ever meets it
- [x] Also cap how large a single row may be, without which the row count is
      theatre
- [x] Prove it, and prove the proof can fail

`supabase/migrations/0003_row_caps.sql`, applied to the live project. Two
commands:

```
node scripts/prove-caps.mjs
node scripts/prove-caps.mjs --self-test
```

28 checks green, and the self-test goes 8 for 8 red as it must.

**The limits.** 2,000 players and 500 groups per account. The busiest real
account holds 31 players and 6 groups, so these are roughly 60x and 80x actual
use. They are readable from the database itself with `select
public.row_cap('players')`, which is where the test reads them from, so the
number being asserted is always the number being enforced.

**A row count alone would have been theatre.** `name` is unbounded text and
`special_types` unbounded jsonb, and Postgres will store a single value up to a
gigabyte. Two thousand rows with no size limit is not a limit. So there are
`check` constraints too: 200 characters on names, 64 on ids, 8 KB of settings,
32 KB of group ids on a player. Every one is far above what the app produces;
the longest name in the live database is 25 characters.

**The limits count deleted rows on purpose.** Deleting a group writes a
tombstone rather than removing the row, because a physical delete would be
resurrected by the next device to sync. Counting only live rows would let
anyone insert, delete and insert again without limit, which is no limit at all.
The numbers are set wide enough to absorb years of churn.

**Three things this had to get right, all tested rather than reasoned about:**

An `after insert ... for each statement` trigger, not `before insert ... for
each row`. Sync writes with `upsert`, and a per-row trigger fires for every row
of an `insert ... on conflict do update`, including the ones that are really
updates. A full account would have been unable to edit what it already owned,
which is a worse bug than the one being prevented. The transition table holds
only the rows genuinely inserted, so re-sending what the server already has
produces a transition table of zero. It also counts once per statement instead
of once per row.

A batch that would cross the limit lands not at all. Partial success would leave
rows on the server that the outbox no longer knows about.

Every size probe uses an id of its own. Reusing one would collide on the primary
key, and a duplicate-key error looks exactly like a size limit doing its job, so
the whole section would have passed for the wrong reason.

**What it does not stop.** An attacker can still sign up repeatedly. This turns
filling the database from one account into several hundred, each needing its own
email address, which is a real change but not a wall. The 100 sign-in emails a
day from item 3 is the tighter constraint on that.

`src/lib/sync.ts` now reports a refusal in the user's own words rather than as
"couldn't reach your account". Every other push failure is worth retrying; this
one is refused identically every time, and blaming the network would send
someone looking at their wifi for a problem that is in their data.

### 8. Error monitoring **[me, then Jeff]** DONE 2026-08-09

- [x] Stop a crash being a white screen, which needs nobody's account
- [x] Sentry free tier, or equivalent
- [x] Wire the release to `APP_VERSION` so a report names the right build
- [x] Send no names, and prove it against what actually goes on the wire
- [x] Prove it, and prove the proof can fail
- [x] Jeff created the Sentry account. The DSN is committed in
      `src/lib/monitoring.ts` rather than set in Vercel, because a DSN only
      accepts crashes coming in and a value that lives only in a dashboard is a
      value that gets silently lost
- [ ] **Jeff, optional, two minutes.** Sentry → Settings → Security & Privacy →
      **Prevent Storing of IP Addresses**. The app never sends one, but Sentry
      infers it from the connection, and the privacy policy says none is kept
- [ ] Visit `?crashtest` once after the next deploy, and check the issue appears

Two jobs that sound like one, kept apart because only the second needs anything
outside this repository.

**Telling the person holding the phone.** `ErrorBoundary` in
`src/components/layout/ErrorBoundary.tsx` replaces the white page with a screen
that says the groups and players are still saved, offers Reload, and offers to
send the details by email. Shipped, working, and it needs no account and no
DSN. This is the half that matters to somebody standing at a court.

**Telling Jeff.** `src/lib/monitoring.ts` reports to Sentry, at the DSN
committed there on 2026-08-09. Setting `VITE_SENTRY_DSN` in Vercel overrides it,
and setting that variable to an empty value is the off switch. Sending nothing
is a supported state, not a broken one, and it is the state every test runs in
unless it says otherwise.

**The version is the join.** `release` is `APP_VERSION`, the same string in the
footer and on every bug report, which is why it has to be bumped in the commit
that deploys.

**Sentry is not downloaded until something has already gone wrong.** The eager
bundle grew by 1.8 KB gzipped; the reporter is a separate 18 KB chunk fetched
at the moment of the crash. Nobody who never crashes pays for it.

**18 KB rather than 144 KB.** `Sentry.init()` statically references its whole
default integration list, so Replay, tracing, profiling and the feedback widget
land in the chunk whether or not they are switched on, and
`defaultIntegrations: false` does not remove them. Building a `BrowserClient`
by hand is Sentry's own documented way out. Measured both ways on this app.

**A crash loop cannot spend the month.** The free plan takes 5,000 events and
drops the rest silently, and a component throwing on every render can produce
thousands in a second. Each distinct fault is sent once, a session sends at
most five, and the noise everyone else wastes their allowance on
(`ResizeObserver loop`, `Script error.`, browser extensions) is dropped before
anything is even loaded.

**No names leave the browser.** No breadcrumbs, no user, no app state, no page
URL. The message and the stack are put through `scrub()`, which redacts the
player and group names actually in storage, plus emails, link query strings and
long digit runs. It over-redacts on purpose: a player called "Type" turns
"TypeError" into "[name]Error", which is a worse message and not a leak.

**Two things tested rather than reasoned about.**

`monitoring.delivery.test.ts` runs the real SDK against a server on this
machine and reads what arrives. That is what caught the one real bug in this
work: tags passed to `captureException` are a *hint*, not scope data, so every
report was going out with no tag at all while looking perfectly correct from
the calling side. No mock could have seen it.

The transport is handed the page's own `fetch`. Left alone Sentry pulls an
unpatched one out of a hidden iframe, which guards against a page that has
replaced `window.fetch`. Nothing here replaces it, and the iframe trick has
nothing to grab outside a real browser, so it would have made the delivery test
impossible.

```
npm test
```

309 tests green, 44 of them this. Fourteen deliberate breakages, one per guard,
each turning at least one test red.

**What is left, and it needs Jeff.** Creating a Sentry account needs his email
and his agreement to their terms. Until the DSN is in Vercel, crashes are shown
to the user and not sent to anybody.

**One knock-on for item 10.** Sentry becomes the fourth processor the privacy
policy has to name, alongside Vercel, Supabase and Resend. Worth turning off
"Store IP Addresses" in their project settings while signing up, which
`docs/error-monitoring.md` covers.

---

## Tier C. The legal gate. These block sharing widely, not building.

### 9. Delete my account, and download my data **[me]** DONE 2026-08-09

- [x] A migration adding a `security definer` function that deletes the caller's
      `auth.users` row. The existing `on delete cascade` clears `profiles`,
      `rosters`, `players` and `preferences`
- [x] A panel to call it, with a confirmation that makes the finality clear
- [x] A data export in the same pass
- [x] Leave the device's own groups and players alone, and say so on the screen
- [x] Prove it against the live database, and prove the proof can fail

This was the only item on the list needing privileges the browser does not have.
The anon key cannot touch `auth.users`.

`supabase/migrations/0004_delete_account.sql`, applied to the live project. Two
commands:

```
node scripts/prove-delete.mjs
node scripts/prove-delete.mjs --self-test
```

17 checks green, and the self-test goes 6 for 6 red as it must.

**One function, taking no arguments.** That is the whole security model, and it
is structural rather than a check that could be got round: there is no account
id to pass, so there is nothing to aim at somebody else. `auth.uid()` comes from
the verified token. Execute is granted to `authenticated` only, because Postgres
grants it to everybody by default and the revoke is doing real work.

**Nothing enumerates tables.** Every foreign key pointing at `auth.users`
cascades, including Supabase's own, which was checked against the live database
rather than assumed. Deleting the one row is the entire job, and a table added by
a later migration is covered without anybody remembering to come back here.

**What stays is the reassuring part, and it is true.** Groups and players live on
the device. An account is a copy for reaching a second phone, so ending one
leaves the app exactly as it is for the many people who never made one. The
screen says that before it asks for anything.

**The confirmation is most of the work.** It names what goes and what stays,
offers the download right there rather than sending anyone to find it, and will
not accept a tap alone. Typing the word is the ordinary reason: this is a list of
grey rows on a phone, and the row above it is Sign Out.

**The download is a record, not a convenience.** JSON, with the server's own
column names, because an access request should show what is held rather than a
tidied retelling of it. A `readme` inside the file translates it, and says which
things never left the device at all. Import / Export is still the way to get a
spreadsheet.

**Two things that would have been quiet bugs.** PostgREST answers with a plain
object rather than an `Error`, and every place that reads a message asks
`instanceof Error` first, so a perfectly good message arrives at the user as
`[object Object]`. And deleting signs the person out, so unless the finished
screen is chosen before anything reads the auth state, a successful deletion
snaps back to Sign In as though the button had done nothing.

**Sign-out keeps the outbox on purpose; deleting cannot.** Those queued writes
belong to an account that no longer exists, and left alone they would be pushed
into whichever account signed in next. `forgetAccount()` clears the queue, the
owner marker, the mirror and the read cursor, and removes the cursor key outright
because its name carries the deleted account's id.

**One knock-on for backups.** A deleted account is out of the live database at
once and out of the last-30 dumps within a month. Written up in
[docs/backups.md](docs/backups.md) so the answer exists before anybody asks.

### 10. Privacy policy **[me]** DONE 2026-08-09

- [x] A static file in `public/`, not an in-app panel
- [x] Plain language: what is collected, why, and that it is not sold
- [x] Name the real processors: Vercel, Supabase, Resend, Ko-fi, and Sentry
- [x] Link it from the settings drawer and the footer
- [x] Say how to delete and how to download, and that both are buttons in My
      Account rather than an email to anybody
- [x] Jeff turned Web Analytics on in Vercel, so the sentence about counting
      page views is now true. Verified: `/_vercel/insights/script.js` returns
      200, where it 404'd an hour earlier

`public/privacy.html`, published at
[app.pbroundrobin.com/privacy.html](https://app.pbroundrobin.com/privacy.html).
Plain HTML with its own styles, so it cannot break when the app's build changes
and it opens with no JavaScript. Deliberately not a panel: the app has no router,
so an in-app version would have no address, and Ko-fi, an app store listing and
a scraper all want an address.

**The strongest sentence in it is the one about people who never sign in.**
Nothing they type ever leaves the device, so there is nothing to ask for and
nothing to be lost by anybody else. That is true of most people using this app,
and it is worth leading with.

**Two rights, two buttons, no email to anybody.** Item 9 shipped both the day
before this was written, so the policy describes what is already there rather
than promising a process. That is the difference between a policy that is
accurate and one that creates work.

**Five companies, and a test that keeps it five.** `src/lib/privacy.test.ts`
reads the page and the real dependency list, and goes red if an SDK is installed
that the page does not name, if a sixth row appears in the table, if the two
button names drift, if the contact address drifts, if a script from another host
is added, or if either link in the app stops pointing at it. Resend is the one
name nothing in this repo can detect, because it is configured in Supabase's
dashboard, so the test carries it as a literal on purpose. Eleven sabotages,
eleven red.

**One thing the page had to be corrected about before it shipped.** The first
draft said deleted groups and players are kept only briefly. They are not:
deleting sets a marker and the row stays, name and all, until the account goes.
The page now says that, and the same overstatement was fixed in the readme
inside the downloaded file. Purging old markers on a schedule is a real
improvement and is not on this list yet.

**Known gaps, both deliberate.** There is no cookie banner, because there are no
cookies to consent to. And the policy is a single page in English, which is the
right size for one person running a free app.

### 11. Terms of service **[me]**

- [ ] Same shape, same place as the privacy policy
- [ ] Liability disclaimer: use at your own risk, no warranty, not liable for
      any event outcome. This is the load-bearing part
- [ ] Acceptable use, so there are grounds to ban someone
- [ ] Written so a paid tier can be added later without a rewrite
- [ ] Link it beside Privacy in the footer and the settings drawer

Most of the shape is now decided by item 10. Copy `public/privacy.html` to
`public/terms.html`, keep its styles, add `TERMS_URL` next to `PRIVACY_URL` in
`src/lib/appInfo.ts`, and put it in the two places the privacy link already
sits. The footer comment says as much.

---

## Tier D. What real courts will break, and what is untested.

The remaining phases of the accounts plan, which lives at
`~/.claude/plans/pickleball-round-robin-generator-linked-mitten.md`. Listed here
so there is one queue and not two.

- [ ] **12. Phase 2b, the SignInBanner** **[me]**. Specced and ready. Its
      promise is true now that Phase 4 has shipped
- [ ] **13. Phase 5, outbox retry and backoff** **[me]**. The one-bar-at-the-court
      case, and the most likely real-world failure of the core feature. More
      launch-relevant than most of Tier E
- [ ] **14. Phase 6, service worker** **[me]**
- [ ] **15. Coverage for the three account panels** **[me]**. Nothing in the 260
      tests mounts them. `MergeChoicePanel` has never run in a real conflict; it
      was verified once with fabricated counts

---

## Tier E. Growth. Worth doing once the above holds.

- [ ] **16. Support email and a short FAQ** **[both]**. An address that is
      actually monitored, and a page that deflects the common questions
- [ ] **17. Product analytics** **[me]**. Event level, beyond traffic. Whatever
      is chosen gets disclosed in the privacy policy
- [ ] **18. An onboarding pass** **[both]**. Timed against a real stranger
      reaching a working schedule. The target is under sixty seconds
- [ ] **19. An invite flow** **[me]**. So a host pulls their whole playing group
      in rather than typing it
- [ ] **20. A landing page at the apex** **[both]**. Replacing the redirect from
      item 2, once there is something worth pointing press at
- [ ] **21. The launch kit** **[Jeff]**. One-line pitch, one paragraph,
      screenshots, a short recording, and the list of places to post

---

## Tier F. Only if subscriptions happen.

- [ ] **22. Payments** **[me]**. Stripe, so card data is never touched here.
      Failed payments, cancellations and refunds all need a path. The reserved
      columns in `profiles` are already there for it
- [ ] **23. Tax** **[Jeff]**. GST and HST here, sales tax elsewhere. Stripe Tax
      automates most of it, and it is easier to set up before revenue than after

---

## Considered and dropped

- **Rate limiting on writes**, as originally written. There is no server to run
  it on. Item 7 is the version that is actually possible here.
- **Add a guest mode.** It already is the default.
- **Feedback capture.** Built.
- **Sharing metadata.** Built, and verified against the live host.
