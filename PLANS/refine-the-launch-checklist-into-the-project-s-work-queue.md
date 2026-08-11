# Refine the launch checklist into the project's work queue

## Context

Jeff drafted `INBOX/pickleball-app-launch-checklist.md` while driving, in a chat
with a model that had never seen this codebase. He has said plainly not to treat
any of it as authoritative. It is raw input.

The job is to turn it into the ordered list we actually work from, one item at a
time, so that "what's next?" has a single answer. Three things have to come out
of it: the corrections, the architectural forks worth settling now, and the
order.

I checked the list against the code and the live site rather than taking it at
face value. That changed a lot of it.

---

## What the code says, against what the list assumed

**The stack line is wrong, and it matters.** The list says "Next.js-style app."
This is a Vite + React SPA. There is no `api/` directory, no `vercel.json`, and
no serverless function anywhere in the repo. The browser talks straight to
Supabase with the publishable key, and RLS is the whole of the protection. Two
list items assume a server that does not exist.

**Supabase Free has no automated backups.** The list says "verify they are on."
They are not. Daily backups start at Pro.

**The bare domain is dead.** `pbroundrobin.com` returns 404 and
`www.pbroundrobin.com` does not resolve. Only `app.` is wired up in the Vercel
project. Anyone who hears the name and types it gets nothing. This is not on the
list at all, and it is the most direct threat to marketing widely.

**The single most likely thing to break in a spike is not on the list either.**
Sign-in is a 6-digit code sent by email through Resend. Resend's free tier caps
at 100 sends a day. On a good day that ceiling is reached before lunch, and from
then on nobody can sign in or create an account. It fails quietly.

**Four items are already done.** Feedback capture is built and ships diagnostics
(`src/lib/feedback.ts`, `FeedbackPanel.tsx`). Guest mode is not something to
"consider": no account is needed to use the app, that is the default and the
tested path. Share previews are done and verified against the live host. Empty
states exist ("Add your first player!", `RosterPage.tsx:319`).

**One thing the list is right to worry about, for the wrong reason.** RLS
policies read as correct: all four tables, `to authenticated` only, and every
update policy carries both `using` and `with check`, so a row cannot be handed
to another user. The gap is not the policies, it is that nobody has ever proved
them with two real accounts.

**A risk the list could not know about.** A total loss of the Supabase data is
survivable. `planMerge()` unions local and server state and pushes up whatever
the server lacks, so a device that still holds its groups would restore them on
the next sync. Deletion only travels by explicit tombstone. This lowers the
backup panic, and it is worth writing down so we do not over-buy.

---

## The one architectural fork, settled

Only one item on the list needs privileges the browser does not have: deleting
an account. The anon key cannot touch `auth.users`.

**Decision: a `security definer` Postgres function, in a migration.** It deletes
the user's `auth.users` row and lets the existing `on delete cascade` foreign
keys clear `profiles`, `rosters`, `players` and `preferences`. Zero new
infrastructure, and it lives in the same versioned SQL as everything else.

It follows the pattern `handle_new_user()` already sets in
`supabase/migrations/0001_accounts.sql`: `security definer`, empty
`search_path`, every reference schema qualified.

Nothing else on the list requires a server tier. Per-user abuse caps go in
Postgres too, as a trigger. Error monitoring and analytics are client side. The
legal pages are static files. **The app stays a pure SPA, and that is worth
protecting.**

---

## The refined list

Ordered by risk and dependency, so working top down is always right. Items are
marked **[Jeff]** where the work is in a dashboard I cannot reach, **[me]**
where it is code, and **[both]** where it is a handoff.

### Tier A. Do first. All cheap, all high regret if skipped.

**1. Name clearance search** **[both]**
Jeff would rename on a real conflict, and every week of use builds more equity
into a name nobody has checked. The name is already in `index.html`, `APP_URL`,
`FEEDBACK_EMAIL`, the domain and the Ko-fi handle. Search CIPO, USPTO, both app
stores and the open web. Write the findings down even if clean, so this is never
re-litigated. An hour, and it never gets cheaper.

**2. Point the bare domain at the app** **[Jeff]**
Add `pbroundrobin.com` and `www.pbroundrobin.com` to the Vercel project as
redirects to `app.pbroundrobin.com`. Ten minutes, and it closes a live failure.
The landing page is item 20; this is not that.

**3. Raise the sign-in email ceiling, and make a failed send visible** **[both]**
Confirm the real Resend limit and the Supabase auth rate limits, and raise both
before traffic rather than during it. Then make the failure legible: today a
throttled send and a wrong address probably read the same to the user.
`ACCOUNTS_ENABLED` in `src/lib/appInfo.ts` is the kill switch if this ever goes
bad, and that should be written into the checklist as the rollback.

### Tier B. Data safety, and being able to see what is happening.

**4. Backups** **[Jeff]**
There are none today. Either move to Supabase Pro for daily backups, or script a
`pg_dump` to external storage. Recommendation: script the dump first, because it
is free, it works on any plan, and a restore you have actually run is worth more
than a backup you have never tested. Run one test restore into a scratch
project.

**5. Billing caps, and the upgrade trigger** **[Jeff]**
Set the caps on both Vercel and Supabase. Then write down what happens at the
free ceiling on each, and pick the number that triggers an upgrade before you
are at it. Two specifics worth resolving here: whether the donate button puts
this project outside Vercel Hobby's non-commercial terms, and the fact that a
paid tier later makes that answer definitely yes.

**6. Prove RLS with two real accounts** **[me]**
The policies read correctly; that is not the same as tested. A script signing in
as two accounts with the publishable key, attempting cross-account read, update
and delete on all four tables, and asserting every one fails. The service role
bypasses RLS, so it proves nothing and must not appear in the test.

**7. Cap what one account can create** **[me]**
The publishable key is in the bundle, so anyone can sign up and insert rows.
With no server tier, Postgres is the only place a limit can live. A trigger with
generous per-user row counts on `players` and `rosters`, set high enough that no
real user meets it.

**8. Error monitoring** **[me]**
Client crashes are invisible today. There is no server, no logs, and no way to
learn about a broken render except an email from whoever hit it. Sentry's free
tier, wired to the version already in `APP_VERSION`.

### Tier C. The legal gate. These block sharing widely, not building.

**9. Delete my account, and download my data** **[me]**
The migration described above, plus the panel to call it and a confirmation that
makes the finality clear. Export is cheap once you are in there and covers the
GDPR access right, so do both in one pass.

**10. Privacy policy** **[me]**
As a static file in `public/`, not an in-app panel. The app has no router, and a
policy needs to be linkable from Ko-fi, from an app store listing and from a
scraper. Link it from the settings drawer and the footer. Name the actual
processors: Vercel, Supabase, Resend, Ko-fi.

**11. Terms of service** **[me]**
Same shape, same place. The load-bearing part is the liability disclaimer, and
acceptable-use language so there are grounds to ban someone. Write it so a paid
tier can be added later without a rewrite, since subscriptions are likely.

### Tier D. What real courts will break, and what is untested.

These are the remaining phases of the accounts plan at
`~/.claude/plans/pickleball-round-robin-generator-linked-mitten.md`. Listed here
so there is one queue, not two.

**12. Phase 2b, the SignInBanner** **[me]**
Already specced and ready. Its promise is true now that Phase 4 has shipped.

**13. Phase 5, outbox retry and backoff** **[me]**
The one-bar-at-the-court case. This is the most likely real-world failure of the
core feature, and it is more launch-relevant than most of Tier E.

**14. Phase 6, service worker** **[me]**

**15. Coverage for the three account panels** **[me]**
Nothing in the 260 tests mounts them. `MergeChoicePanel` in particular has never
run in a real conflict; it was verified once with fabricated counts.

### Tier E. Growth. Only worth doing once the above holds.

**16.** Support email and a short FAQ **[both]**
**17.** Product analytics beyond traffic, disclosed in the privacy policy **[me]**
**18.** An onboarding pass, timed against a real stranger reaching a schedule **[both]**
**19.** An invite flow, so a host pulls their whole group in **[me]**
**20.** A landing page at the apex, replacing the redirect from item 2 **[both]**
**21.** The launch kit: one-line pitch, a paragraph, screenshots, and the list of
places to post **[Jeff]**

### Tier F. Only if subscriptions happen.

**22.** Stripe, and the failed-payment, cancellation and refund paths. The
reserved columns in `profiles` are already there for it.
**23.** GST/HST and sales tax, via Stripe Tax, set up before revenue.

### Dropped from the original list

- "Rate limiting on writes" as written. There is no server to run it on; item 7
  replaces it with the version that is actually possible.
- "Consider a demo/guest mode." It already is the default.
- "Feedback capture." Built.
- "Sharing metadata." Built and verified live.

---

## Files to change

| File | Change |
|---|---|
| `launch-checklist.md` (new, repo root) | The list above, as the living document |
| `INBOX/pickleball-app-launch-checklist.md` | Delete, superseded by the above |
| `~/.claude/.../memory/launch-checklist-is-the-work-queue.md` (new) | Pointer to the file and how to answer "what's next" |
| `~/.claude/.../memory/this-app-has-no-server-tier.md` (new) | The SPA constraint, and that privilege goes in a `security definer` function |
| `~/.claude/.../memory/MEMORY.md` | Two index lines |

No source code changes. This is a documentation and memory task; every item on
the list is its own later piece of work.

## Steps

1. Write `launch-checklist.md` at the repo root with the content above,
   formatted as a working checklist with real checkboxes rather than prose.
2. Delete `INBOX/pickleball-app-launch-checklist.md`.
3. Write the two memory files, and add their lines to `MEMORY.md`.
4. Commit both the new checklist and the INBOX deletion in one commit. No
   `APP_VERSION` bump: nothing ships to users, so there is no build to name.

## Verification

- `launch-checklist.md` exists at the root and is tracked; the INBOX copy is
  gone. `git status` clean afterwards.
- Re-check the two live facts the list now asserts, so the document is not
  born stale: `curl -sI https://pbroundrobin.com/` still 404s, and
  `https://app.pbroundrobin.com/` still 200s.
- `MEMORY.md` has exactly two new lines, and each points at a file that exists.
- No source file changed: `git diff --stat` touches only markdown.
- Nothing to run. `npm test` and `tsc -b` are unaffected, so they are not part
  of the check.
