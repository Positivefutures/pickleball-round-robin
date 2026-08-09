# Launch Checklist

What still has to be true before marketing this app widely.

Ordered by risk and dependency, so working top down is always the right move.
Tick items as they land. When the question is "what should I work on next?",
the answer is the first unticked box.

Tags: **[Jeff]** for work in a dashboard the agent cannot reach, **[me]** for
code, **[both]** for a handoff.

Last reviewed against the code and the live site: 2026-08-08, at `1.9.1`.

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

### 5. Billing caps, and the upgrade trigger **[Jeff]**

- [ ] Set spending caps and alerts on both Vercel and Supabase
- [ ] Write down what happens at each free ceiling: down, throttled, or billed
- [ ] Pick the number that triggers an upgrade, before you are at it
- [ ] Resolve whether the donate button puts this outside Vercel Hobby's
      non-commercial terms. A paid tier later makes that answer definitely yes

The limits that bite first are Supabase database size, monthly active users and
egress.

### 6. Prove RLS with two real accounts **[me]**

- [ ] A script that signs in as two accounts using the publishable key
- [ ] Attempt cross-account read, update and delete on all four tables
- [ ] Assert every one of them fails

The policies read correctly: all four tables, `to authenticated` only, and
every update policy carries both `using` and `with check`, so a row cannot be
handed to another user. That is not the same as tested. The service role
bypasses RLS entirely, so it proves nothing and must not appear in the test.

### 7. Cap what one account can create **[me]**

- [ ] A trigger with per-user row counts on `players` and `rosters`
- [ ] Set generously, so no real user ever meets it

The publishable key ships in the bundle, so anyone can sign up and insert rows.
With no server tier, Postgres is the only place a limit can live.

### 8. Error monitoring **[me]**

- [ ] Sentry free tier, or equivalent
- [ ] Wire the release to `APP_VERSION` so a report names the right build

Client crashes are invisible today. There is no server, no logs, and no way to
learn about a broken render except an email from whoever hit it.

---

## Tier C. The legal gate. These block sharing widely, not building.

### 9. Delete my account, and download my data **[me]**

- [ ] A migration adding a `security definer` function that deletes the caller's
      `auth.users` row. The existing `on delete cascade` clears `profiles`,
      `rosters`, `players` and `preferences`
- [ ] A panel to call it, with a confirmation that makes the finality clear
- [ ] A data export in the same pass

This is the only item on the list needing privileges the browser does not have.
The anon key cannot touch `auth.users`. Export is cheap once you are in there,
and it covers the GDPR access right.

### 10. Privacy policy **[me]**

- [ ] A static file in `public/`, not an in-app panel
- [ ] Plain language: what is collected, why, and that it is not sold
- [ ] Name the real processors: Vercel, Supabase, Resend, Ko-fi
- [ ] Link it from the settings drawer and the footer

Static, because the app has no router and a policy needs to be linkable from
Ko-fi, an app store listing, and a scraper. PIPEDA applies here already, and
GDPR applies the moment there is one EU user.

### 11. Terms of service **[me]**

- [ ] Same shape, same place as the privacy policy
- [ ] Liability disclaimer: use at your own risk, no warranty, not liable for
      any event outcome. This is the load-bearing part
- [ ] Acceptable use, so there are grounds to ban someone
- [ ] Written so a paid tier can be added later without a rewrite

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
