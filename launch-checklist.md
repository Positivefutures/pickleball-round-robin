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

### 1. Name clearance search **[both]**

- [ ] Search CIPO, USPTO, the Apple and Google app stores, and the open web
- [ ] Write the findings down, even if clean, so this is never re-litigated
- [ ] If a real conflict turns up, decide before building more on the name

The name is already in `index.html`, `APP_URL`, `FEEDBACK_EMAIL`, the domain
and the Ko-fi handle. Every week of use builds more equity into a name nobody
has checked. An hour of work, and it never gets cheaper than today.

### 2. Point the bare domain at the app **[Jeff]**

- [ ] Add `pbroundrobin.com` and `www.pbroundrobin.com` to the Vercel project,
      redirecting to `app.pbroundrobin.com`
- [ ] Confirm both return a redirect, not a 404

Today `pbroundrobin.com` returns 404 and `www.pbroundrobin.com` does not
resolve at all. Only `app.` is wired up. Anyone who hears the name and types it
gets nothing. Ten minutes. The landing page is item 20, and this is not that.

### 3. Raise the sign-in email ceiling **[both]**

- [ ] Confirm the real Resend send limit and raise it before traffic arrives
- [ ] Confirm the Supabase auth rate limits and tune them to match
- [ ] Make a throttled send read differently from a wrong address in the UI
- [ ] Write `ACCOUNTS_ENABLED` into the runbook as the rollback if this goes bad

Sign-in is a six-digit code by email through Resend. The free tier caps at 100
sends a day. On a genuinely good day that ceiling arrives before lunch, and
from then on nobody can sign in or create an account. It fails quietly, which
is what makes it the most likely thing to break first.

---

## Tier B. Data safety, and being able to see what is happening.

### 4. Backups **[Jeff]**

- [ ] Script a `pg_dump` to external storage
- [ ] Run one test restore into a scratch project, so the process is proven
- [ ] Decide separately whether Supabase Pro is worth it for daily backups

There are no automated backups today. That is a Pro feature, not something to
verify. Script the dump first: it is free, it works on any plan, and a restore
you have actually run beats a backup you have never tested.

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
