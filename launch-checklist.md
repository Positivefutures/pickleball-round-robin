# Launch Checklist

What still has to be true before marketing this app widely.

Ordered by risk and dependency, so working top down is always the right move.
Tick items as they land. When the question is "what should I work on next?",
the answer is the first unticked box.

Tags: **[Jeff]** for work in a dashboard the agent cannot reach, **[me]** for
code, **[both]** for a handoff.

Last reviewed against the code and the live site: 2026-08-09, at `1.9.8`.

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
- [x] Decision: no rename *for legal reasons*. There is no conflict to act on.
      Renamed anyway on 2026-08-22, on the commercial finding below

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

**What follows from this.** No letter is coming, and none of the above forced a
rename. But the name would not pick this app out of a list of twenty-five, and
that is what eventually did.

**Superseded 2026-08-22: renamed to RoundRobinator.** Not for a legal reason —
everything above still holds — but for the commercial one in the paragraph
before it. The app is now **RoundRobinator**, with **Round Robin Generator** as
the line under it, so the coined word carries the identity and the plain words
carry the search. The banner, the settings drawer, the player's view, the
printed sheet, the PDF, the manifest, the share sheet, the og: tags and both
legal pages all say it. Section 13 of PRODUCT-CONTEXT.md has the reasoning.

Three things the rename deliberately did not touch, because they are live
infrastructure rather than copy: `pbroundrobin.com` and `app.pbroundrobin.com`,
`jeff@pbroundrobin.com`, and `ko-fi.com/pbroundrobin`. Moving any of them is its
own job with its own redirects. `og-banner.png` is a fourth: it is drawn artwork
with the old name in it, and until it is redrawn a shared link still previews
under the old name.

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

### 3. Raise the sign-in email ceiling **[both]** DONE FOR NOW

- [x] Confirm the real Resend send limit. **100 a day, 3,000 a month**
- [x] Confirm the Supabase auth rate limit. **30 emails an hour**
- [x] Make a throttled send read differently from a wrong address in the UI
- [x] Write `ACCOUNTS_ENABLED` into the runbook as the rollback if this goes bad
- [x] **Raise the Supabase hourly cap.** Raised from 30 to **100 an hour** on
      2026-08-09
- [x] Decide whether Resend's 100 a day is worth paying to lift. **Not yet.**
      Jeff checked the plan and confirmed the pricing on 2026-08-09. The trigger
      to revisit is **40 sends in a day**, which is where the headroom stops
      being comfortable. Nothing measures that automatically today, so it is a
      dashboard glance rather than an alert

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
- [x] Jeff turned on Sentry → Settings → Security & Privacy → **Prevent Storing
      of IP Addresses**, so the settings now match what the privacy policy says
- [x] Jeff visited `?crashtest` on the live site. The screen appeared, the issue
      reached Sentry, and the email arrived. End to end, proved by use

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

### 11. Terms of service **[me]** DONE 2026-08-09

- [x] Same shape, same place as the privacy policy
- [x] Liability disclaimer: use at your own risk, no warranty, not liable for
      any event outcome. This is the load-bearing part
- [x] Acceptable use, so there are grounds to ban someone
- [x] Written so a paid tier can be added later without a rewrite
- [x] Link it beside Privacy in the footer and the settings drawer

`public/terms.html`, published at
[app.pbroundrobin.com/terms.html](https://app.pbroundrobin.com/terms.html), and
`TERMS_URL` sits beside `PRIVACY_URL` in `src/lib/appInfo.ts`. The two pages now
travel as a pair: each links the other, and both appear in the footer and at the
bottom of the settings drawer. A store listing asks for both, and a person who
lands on one should not have to search for the other.

**The liability section is written as a list of situations, not as capitals.**
The outcome of a session, an argument between two players, an injury at the
court, a ladder decided on a schedule the app produced, and data lost with a
phone. That is what this app could plausibly be blamed for, so those are the
things named. The formal wording follows in one paragraph underneath, capped at
what has been paid, which for everybody today is nothing.

**The strongest sentence for Jeff is the one about the courts.** The app spreads
partners and sit-outs well and is still software that can be confidently wrong
about a round. The page says to check a schedule before reading it out, which is
both true and the reason the disclaimer is fair.

**Acceptable use exists to make a ban defensible.** Seven lines, each one a thing
somebody could actually do: harassment, reaching another account, probing the
service, automated sign-ups, breaking it for others, illegal content, and
passing the app off as their own. Serious cases end an account without warning,
smaller ones get an email first, and ending an account never touches what is on
that person's own device.

**A paid tier will not need this rewritten.** One section says the app is free
today, that any charge would be new and optional, that the price comes before
the charge, and that a payment company would handle the card. Donating is
described separately as a gift that buys nothing, which is what keeps Ko-fi from
looking like a purchase with a refund attached.

**The test guards the claim that goes stale silently.**
`src/lib/terms.test.ts` fails the day a payment library appears in
`package.json` while the page still says nothing is charged for, which is the
one way this page becomes untrue without anybody editing it. It also holds the
button names, the contact address, the cross-links, and the two links in the
app. Fourteen sabotages, fourteen red.

**One real hole the sabotage pass found.** Both legal pages were checked for the
contact address as text, so a `mailto:` could have pointed anywhere while the
page still read correctly. Both tests now check every `mailto:` on the page.
That was a live weakness in item 10's test, fixed here.

**Not covered, and deliberately.** No click-to-accept, because nobody signs up
to a free scheduling app through a consent gate, and use is the acceptance. No
lawyer has read this. It is a careful plain-language agreement for a free app
run by one person, and it should be reviewed by one before any money changes
hands.

---

## Tier D. What real courts will break, and what is untested.

The remaining phases of the accounts plan, which lives at
`~/.claude/plans/pickleball-round-robin-generator-linked-mitten.md`. Listed here
so there is one queue and not two.

- [x] **12. Phase 2b, the SignInBanner** **[me]**. Done 2026-08-11, and the last
      phase of the accounts plan. One line above the step, offered once a group
      is four players deep, gone for good on the cross, and never shown to
      somebody already signed in. That last part reads `hasStoredSession()`
      rather than the auth store, which says `unknown` until the Supabase client
      has loaded: without it the banner flashed on every launch at the one
      person it is not for. It waits its turn behind the install banner, which
      wants the same four players, so no step ever carries two coloured bars.
      Share Live Session offers the same account from inside the Actions sheet
      in the same commit, and comes back to the card when the panel closes
- [x] **13. Phase 5, outbox retry and backoff** **[me]**. The one-bar-at-the-court
      case, and the most likely real-world failure of the core feature. More
      launch-relevant than most of Tier E. Done 2026-08-09 in 1.9.9. The two
      other parts of Phase 5, the `online` and focus triggers and the sync
      status UI, had already shipped inside Phase 4. What was missing was a
      retry on the push path: a failed push waited for the next edit, while the
      panel said it was trying again
- [x] **14. Phase 6, service worker** **[me]**. Done 2026-08-09 in 1.10.0, and
      the last phase of the accounts plan. The app now loads with nothing at
      all: shell precached, panel images cached on sight, and the 957 KB share
      banner deliberately left out. Nothing from Supabase, Sentry or
      `/_vercel/` is ever cached, which is most of what `sw.ts` is about.
      A new build shows a line offering a reload rather than taking one, so a
      deploy cannot swap the code under a host mid-session, and `APP_VERSION`
      in a bug report still names what they are running. Built without
      `vite-plugin-pwa`: it wanted 267 packages and nine high-severity
      advisories to save the twenty lines now in `vite.config.ts`.
      **If a bad build ever ships**, the recovery is an ordinary deploy. Every
      page checks `sw.js` when it comes back to the foreground, so the fix
      reaches people without anyone clearing anything
- [x] **15. Coverage for the account panels** **[me]**. `SignInPanel` and
      `MergeChoicePanel` now mount for real, and the account screen's sync
      states are covered rather than only its delete rows. 42 new tests, 448 in
      total, every one of them proved by breaking the thing it guards.
      **It found a real bug, and the fix is in this commit.** The merge screen
      froze both sides of its comparison, but the merge itself re-read the
      device side, so the two could disagree. The question is raised when the
      app first loads rather than when My Account is opened, and an unanswered
      one survives a relaunch, so somebody could sign in, back out, spend a
      session adding players, and then be shown counts and a list of duplicate
      names from hours earlier. Naming the duplicates is the only thing standing
      between two different people with the same name and becoming one person,
      and consent given to an out of date list is not consent. The question now
      re-reads the device while it waits. Freezing the merge instead would have
      been worse than the bug: it writes its plan back over the stores, so it
      would have deleted whatever arrived in the meantime. There is a test
      holding that door shut too
- [x] **15b. Printing from an installed iPhone** **[me]**. Reported from a
      phone: the printer button had stopped working. Lettered rather than
      numbered because it is a found bug and not a planned item, and renumbering
      the rest would break every reference to them.
      Nothing was wrong with the print code, which has not changed since long
      before any of this. WebKit only ever hosted the print dialog inside
      Safari's own UI, so `window.print()` from a home-screen app returns
      cleanly and nothing happens. It used to work because it was being used in
      a Safari tab. Nothing throws and no promise rejects, so the app cannot
      find out afterwards and has to decide in advance instead.
      An installed iOS app now builds the schedule as a PDF and hands it to the
      OS share sheet, which lists Print next to Save to Files and Mail. The
      sheet belongs to the system rather than the browser, which is why it still
      works there. Everywhere else, including an installed Android app and a
      Safari tab, the button calls `window.print()` exactly as before. That
      restraint is deliberate and tested: routing Android through a share sheet
      would be taking away a working print dialog to solve Apple's problem.
      Written by hand in `src/lib/pdf.ts`. The smallest capable package on npm
      is about a third of a megabyte to download at a court, against 9 KB here,
      and Helvetica is one of the fourteen fonts every reader is required to
      have, so no font data ships. Its widths are read out of the Adobe AFM
      metrics rather than remembered, because every line break depends on them.
      There are two renderers for one document now, so
      `schedulePdf.parity.test.ts` renders both and fails if they ever disagree.
      69 new tests, 517 in total, and 41 sabotages every one of which turned the
      suite red. Two of those found tests passing for the wrong reason rather
      than bugs: the width check was measuring a substituted character instead
      of the real one, and the title check had only ever seen a one-page
      schedule. Both were rewritten to claim only what they can prove.
      **Proved on a real iPhone on 2026-08-10.** Jeff tapped the printer button
      on the installed app and the share sheet opened with Print in it. Before
      that it had only been verified against macOS PDFKit, which is the
      framework iOS prints with, since the share sheet cannot be opened from
      here

- [x] **15c. Six small things off a phone** **[me]**. One batch, one deploy.
      *The blank first page on a desktop printout.* Tailwind's `min-h-screen`
      held the app panel a full viewport tall even with every child of it
      hidden, so the schedule began on page two behind an empty page one. Paper
      has no viewport.
      *The header and footer on the printed sheet.* The date, the title and the
      old Vercel address were the browser's own, printed into the page margin.
      A zero `@page` margin is the only thing in CSS that turns them off, and it
      takes the margins with it, so the sheet reserves its own: an empty table
      head and foot, which is the one thing a browser repeats on every page.
      Padding cannot, because vertical padding lands on the first and last page
      only and page two would start against the edge of the paper.
      *The sheet itself.* Logo beside the title, rounds and courts in capitals,
      names in bold, the sit-out line at the size of the names, and
      app.pbroundrobin.com centred at the foot of every page. Both renderers,
      so the parity test still holds. The logo is in the PDF as raw samples
      generated by `scripts/logo-pdf-asset.mjs`, because the file is built on
      the tap with nothing awaited before the share sheet is asked for, so it
      cannot be fetched and decoded then. 96 pixels across, about 230dpi at the
      size it prints, for 9 KB. A test compares the hash of `public/logo.png`
      against the one the generator recorded, so replacing the logo cannot fix
      the printed sheet and leave the PDF quietly printing the old one.
      *A Close button on the two legal pages.* The same button as Print and
      Menu, with an X. An anchor rather than a button, so it still goes
      somewhere with JavaScript off, which is the one promise those pages make
      about themselves. The script upgrades it to closing the tab where that is
      allowed, and a tab opened from the app is.
      *The version number reading 1.10.0 on a phone two deploys later.* This was
      the real bug. A waiting worker takes over when every page it would replace
      has gone away, and an installed app never lets one go: it is suspended and
      resumed, so the same page is still open weeks later. The banner said
      "Reload to get it" and dismissing it was the end of the matter. A build
      that has been waiting is now let in on its own when somebody comes back
      after a minute away, which stands in for the cold start a home-screen icon
      never gets. Nothing is lost: the schedule, the completed rounds and the
      setup are all in storage. Proved in a real browser, not only against
      fakes: two builds, a swap underneath, and the footer reading the new
      version with nobody tapping anything.
      *Overscroll on a phone.* Dragging past either end hauled the app with it
      and showed the settings drawer sitting behind, which is fixed and so does
      not move. `overscroll-behavior: none` on the document, and the drawer is
      no longer painted at all while it is shut.
      *Long names in the court panels.* Cut with an ellipsis rather than
      wrapped, the whole name kept in the title. Three things had to hold
      together: the name clips, the column is allowed to be narrower than the
      name, and the rating never gives up any width. Without the middle one the
      court grew sideways off the screen instead.
      70 new tests, 557 in total, and 44 sabotages every one of which turned the
      suite red. One sabotage run crashed part way and left a file broken on
      disk; the next run took its baseline from that and its first result was a
      false pass. The harness now restores everything on the way out and deletes
      the report before each run, and the whole pass was taken again from a
      clean tree.
      **The overscroll was confirmed on a real iPhone on 2026-08-10**: the
      screen no longer moves when dragged past either end.
      **One thing is still not proved from here.** Whether Safari, rather than
      Chrome, drops its own header and footer at a zero page margin. The layout
      was checked through Chrome's print pipeline and through macOS PDFKit, and
      neither of those is Safari printing. It only matters to somebody printing
      from a Safari tab, since the installed app goes out through the share
      sheet instead.

- [x] **15d. The My Groups control** **[me]**. Two complaints, one cause.
      The group you are in was set in the smallest type on a panel whose only
      job is to tell you, and tapping it opened a list drawn by the browser
      rather than by us: grey, no wider than the control it came from, animated
      to its own taste, and narrow enough to wrap a group name over two lines.
      All of that comes with a `<select>` and none of it can be styled away.
      So there is no select any more. The control is a button showing the group
      at the size of a name, cut with an ellipsis if it runs out of room, and it
      opens the same bordered card every other dialog in the app uses, titled
      My Groups with the same icon as the panel behind it. Each row carries the
      group and how many players are in it, the one you are in is ticked as well
      as tinted, and a tap switches and shuts. The tick has a slot on every row
      so one row carrying it does not shunt its own count out of line.
      One test guards the thing that started this by refusing to let a `<select>`
      back onto the page at all. 9 new tests, 566 in total, and 16 sabotages
      every one of which turned the suite red. Looked at in Chrome at 390px,
      both states, and with a name long enough to need cutting.
      The Import/Export panel still has a native select for which group to
      export. It was not part of this and has not been touched.

- [x] **15e. Court numbers the host sets** **[me]**. A centre assigns courts 7,
      8 and 9. The app called them 1, 2 and 3 because it has no way of knowing
      better, so "Jeff and Peter versus Joe and James on Court 1" sent four
      people to a court somebody else was playing on.
      The heading is now COURT in capitals and in bold, written out rather than
      set in capitals with CSS so the screen says the same thing as the printed
      sheet and the PDF, which have always said COURT. On a round still to be
      played it is a button, marked with a dotted underline, and it opens a box
      already holding the number with the number selected: a tap, a digit, Done.
      A change runs from the round it was made at to the end of the schedule. It
      never reaches backwards, and it steps over any round already marked
      complete, wherever that round happens to sit, because completed rounds can
      be ticked in any order and each is a record of what was played under the
      name it was played on. Making a second change at an earlier round paints
      through the first, which is what Jeff asked for and what the truth on the
      ground would be.
      Two things beyond the ask, both because leaving them would have looked
      broken. The names survive a reshuffle and a player leaving, which both
      throw the unplayed rounds away and build them again numbered from 1; the
      court has not moved across the hall because somebody went home. And the
      printed sheet and the shared PDF both follow, since the sheet in
      somebody's hand is the copy that matters at the court.
      Courts are renamed one at a time. Setting court 1 to 7 does not offer to
      make the next two 8 and 9, and two courts in the same round may carry the
      same number if that is what was typed. Both are easy to add and neither
      was asked for.
      27 new tests, 593 in total, and 30 sabotages every one of which turned the
      suite red. Driven in a real browser at 390px as well: the box opens
      focused with its contents selected and a numeric keypad, and rounds 2 to 4
      followed while the completed round 1 did not.

- [x] **15f. The step tabs are a way back** **[me, parallel session]**. Players
      and Setup are doors once they have been reached, and Schedule never is:
      the only route onto it is Generate, which builds a new schedule rather
      than returning to the old one. Leaving a schedule by a tab asks the same
      question as leaving it by the button at the foot of the page, so the two
      confirmations moved into components of their own and are raised from App
      as well. Written in a session running alongside this one and committed on
      its own so it was not swept into the next change. It goes out in the same
      deploy as 15g. Superseded in part by 15h, which removed those buttons.

- [x] **15g. The swap hint is a notice, not furniture** **[me]**. "Tap a player,
      then tap another to swap them" was a grey line pinned above the rounds
      that nothing could remove, on every session for the rest of time. It is
      worth reading once.
      It is now the same green banner the install offer uses, with the same X on
      the end, and closing it is written down. It does not come back: not on the
      next session, not after the app is closed and reopened. That is proved by
      relaunching the app in the test rather than re-rendering it, since a
      component that merely forgets its own state would pass a weaker check.
      It still says nothing once every round is complete, which was true of the
      grey line too. There is nothing left to swap by then.
      The dismissal belongs to the device, like the install offer. A new phone
      shows it once, which is the right side to err on for a line that exists to
      teach the gesture.
      7 new tests, 605 in total, and 12 sabotages every one of which turned the
      suite red. Looked at in Chrome at 390px.

- [x] **15h. The tabs are the only way back** **[me]**. Follows 15f, which left
      two routes off a schedule: the tab at the top and a back button at the foot
      of the page. The buttons are gone. `← Players` on Setup and `← Setup` on
      the schedule were saying what the tab above them already said, and neither
      page can be stranded without them: Players is always a door from Setup, and
      a boot straight onto a saved schedule opens the Setup tab because it plainly
      went through Setup to get there.
      The words got fixed on the way. "Generating again from Setup discards this
      schedule" was written for a button below the schedule, and "This clears the
      current schedule" said too little about what clearing costs. All three
      doors now warn in one sentence, "This will discard the current schedule
      including any swaps you've made and rounds you've marked complete", while
      each keeps a heading naming where it goes: Back to Setup?, Back to Players?,
      Start a new session?. The sentence is held in the dialog rather than passed
      in, so no route out can quietly say less than the others. That collapsed
      `BackToSetupDialog` and `NewSessionDialog` into one `DiscardScheduleDialog`.
      Reshuffle and New Session now sit together at the right of the schedule,
      matching the Reshuffle at the foot of the page. That is not cosmetic: the
      row was spread edge to edge, so with the third button gone New Session
      would have jumped to the left the moment the last round was ticked.
      2 new tests, 1 removed with the button it drove, 651 in total, and 8
      sabotages every one of which turned the suite red. Driven in Chrome at
      390px: both dialogs, the New Session dialog, and New Session measured in the
      same place before and after every round was marked complete.

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
