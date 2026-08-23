# Turning the admin dashboard on

Five tasks. Tick a box when it is done, so putting this down for a week costs
nothing.

**Where it will live:** https://pbroundrobin-admin.vercel.app

Everything in "Already done" was checked against the live services on
2026-08-23, not remembered.

---

## Already done

- [x] **The code is written, tested and pushed.** 29 unit tests, plus the whole
      daily job run against a throwaway Postgres.
- [x] **The Vercel project exists.** `pbroundrobin-admin`, building from this
      repo with **Root Directory `admin`**, which is the whole separation
      between it and the app. It redeploys on every push to `main`.
- [x] **Both migrations are applied to the live Supabase project.** Checked by
      calling `admin_quotas()` as a stranger and getting `Not permitted.` back,
      which is the allowlist gate doing its job.
- [x] **You are on the allowlist.** `jeff@positivefutures.com`, seeded by the
      migration. Nobody else can ever be signed in to this.
- [x] **The nightly job's crash is fixed.** It was failing on invocation before
      it ran a line of its own code. Committed, not yet pushed.
- [x] **The job no longer wants an account-wide Supabase token.** It connects
      straight to this one database instead. The whole job, including the new
      connection, has been run end to end against a throwaway Postgres.

## Where it got to on 2026-08-23

The job has run for real against the live database and returned `ok: true` in
642 ms. It backfilled 15 days, 2026-08-08 to 2026-08-22, which is the whole
history there is: the first account was made on the 8th.

- [ ] **Task 1** — `CRON_SECRET` was missing and was added by hand.
      `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are still missing, which
      is why the page says "Not configured". See the note below.
- [x] **Task 2** — `SUPABASE_DB_URL`, and the job is using it
- [ ] **Task 3** — Sentry answers `401 Unauthorized`. See below.
- [ ] **Task 4** — Resend reports "not configured", so the key is not reaching
      the function. See below.
- [x] **Task 5** — pushed, deployed, run by hand

**Sign in now** — the growth, groups and room-left panels are all populated.
Crashes and the email quotas are the two that are still blank.

### Task 3, why Sentry says 401

401 means Sentry does not recognise the token at all, rather than recognising
it and refusing the scope. The likely cause is the organization auth token from
the first attempt: those are fixed at `org:ci` and cannot read. Replace the
value of `SENTRY_AUTH_TOKEN` with a token from an **Internal Integration** —
Task 3 below has the exact page and the three permissions.

### Task 4, why Resend says not configured

That message is what the job prints when `RESEND_API_KEY` is absent from its
environment, so it is a missing or misnamed variable rather than a rejected
key. Check the name is exactly `RESEND_API_KEY` and that **Production** is
ticked. Vercel picks a change up on the next invocation; no redeploy needed.

### The two `VITE_` variables are different from the rest

Everything else in this file is read fresh on every invocation of the job, so
saving it in Vercel is enough and it works on the next run. The two `VITE_`
values are not: Vite writes them **into the JavaScript at build time**. Adding
them changes nothing until the project builds again.

Two consequences worth knowing rather than rediscovering:

- Add them, then redeploy. Saving alone leaves the page saying "Not
  configured", which looks identical to not having added them.
- Whether they are there can be checked from outside without signing in:
  fetch the page, find its `assets/index-*.js`, and search it for the project
  ref. If the ref is absent the build did not have them. The bundle hash also
  gives it away - a build with no new values produces byte-identical output
  and keeps the same hash.

Paste them in one at a time rather than as a block. The block paste silently
dropped variables twice here.

### One thing to tidy

There is a `SUPABASE_URL` variable in the project. It is left over from a route
that no longer exists and nothing reads it. Delete it.

---

# Task 1 — paste five settings into Vercel

1. Open **`admin/.env.local`**.
2. Select **Block 1** — the five lines from `VITE_SUPABASE_URL` down to
   `CRON_SECRET` — and copy them.
3. Go to
   **https://vercel.com/jeff-positivefutus-projects/pbroundrobin-admin/settings/environment-variables**
4. Paste into the **Key** box. Vercel recognises a pasted `.env` and expands it
   into five rows at once. If it does not, there is an **Import .env** control
   on the same page.
5. Leave these five ticked for **all three** environments.
6. **Save.**

Two of them start `VITE_` and are meant to be public — they ship inside the
page, exactly as they do in the main app. `CRON_SECRET` is the one real secret
in this batch and it never leaves Vercel.

---

# Task 2 — the Supabase connection string

This used to be a personal access token. It is not any more, and the reason is
worth thirty seconds: a Supabase access token carries the privileges of your
whole account, every project, including pausing and deleting them. A connection
string reaches one database. Same job, much smaller key.

1. Go to **https://supabase.com/dashboard/project/iiqbeodzhbzgueqcxeqe** and
   click **Connect** at the top.
2. Choose the **Transaction pooler** string. Not "Direct connection" — a free
   project's direct host is IPv6 only and Vercel's functions cannot reach it.
   It looks like:

   ```
   postgresql://postgres.iiqbeodzhbzgueqcxeqe:[YOUR-PASSWORD]@aws-0-REGION.pooler.supabase.com:6543/postgres
   ```
3. Replace `[YOUR-PASSWORD]` with your database password. If you do not have it,
   **Settings → Database → Reset database password** gives you a new one. That
   is safe: nothing else in this project uses it.
4. Go to
   **https://vercel.com/jeff-positivefutus-projects/pbroundrobin-admin/settings/environment-variables**
   and add `SUPABASE_DB_URL` with that string as the value.
5. **Tick Production only.** Untick Preview and Development.
6. **Save.**

Step 5 matters. A Preview value is readable by every preview deployment, and a
preview has no reason to hold a database password. Same for Tasks 3 and 4.

---

# Task 3 — the Sentry token

**Your two names are already settled and already in `.env.local`:**

- `SENTRY_ORG` = `positive-futures`
- `SENTRY_PROJECT` = `pickleball-round-robin`

Read off `https://positive-futures.sentry.io/projects/pickleball-round-robin/`.
Neither is a secret.

## Not an Organization Auth Token

Settings → Auth Tokens creates **Organization Auth Tokens**, and their scope is
fixed at `org:ci` — source map upload and release creation. Sentry does not let
you change it, on that page or afterwards. Those tokens deliberately cannot read
data, so one is no use here. Nothing went wrong; it is the wrong door.

Two doors do work. **Use the first.**

## An Internal Integration (recommended)

It belongs to the organization rather than to your user account, so it survives
you changing your own password or leaving, and it can be revoked on its own
without touching anything else you use Sentry for.

1. Go to
   **https://positive-futures.sentry.io/settings/developer-settings/new-internal/**
   (or Settings → Developer Settings → **New Internal Integration**).
2. Name it `pbrr-admin`.
3. Set exactly three permissions, and leave every other dropdown on **No Access**:
   - **Organization** → `Read`
   - **Project** → `Read`
   - **Issue & Event** → `Read`
4. **Save**. The page then shows a **Token** — that is the value.
5. In Vercel, add `SENTRY_AUTH_TOKEN` with that token, **Production only**.

## Or a personal token, if the above is fiddly

**https://positive-futures.sentry.io/settings/account/api/auth-tokens/** →
**Create New Token** → tick `org:read`, `project:read`, `event:read`.

Same result, except it is tied to your account rather than the organization.
Fine, just slightly worse.

## Add the two names too

While you are on the Vercel page, add `SENTRY_ORG` = `positive-futures` and
`SENTRY_PROJECT` = `pickleball-round-robin`, both ticked for all three
environments. They are names, not secrets.

If Sentry turns out to be more trouble than it is worth, skip this whole task.
Every other panel still works, Crashes shows dashes, and the run notes say why.

Delete the `pbrr-admin` organization token you already made, if you made one.
It cannot do anything, but there is no reason for it to exist.

---

# Task 4 — the Resend key

1. Go to **https://resend.com/api-keys** and **Create API Key**, named
   `pbrr-admin`.
2. Permission: **Full access**, not "Sending access".
3. In Vercel, add `RESEND_API_KEY` with that value, **Production only**.
4. **Save.**

Full access is needed because the job *counts* emails sent, counting means
listing, and a sending-only key cannot list. The cost is real: a full-access
key can read the body of a message already sent, including a sign-in code.
Which is exactly why it is Production only and lives nowhere else.

---

# Task 5 — tell Claude Code to finish it

Come back to the terminal and paste this:

> All four tasks are done and the variables are in Vercel. Push, wait for the
> deploy, run `/api/snapshot` by hand, and tell me what the first run found.

Claude will push, watch the build, call the job once using the `CRON_SECRET`,
check that the history actually backfilled, and report what came back —
including anything a token turned out not to be able to read.

**The first run is the first time any of this touches the live database.**
Everything so far has been proved against a throwaway copy. If something is
going to be wrong, this is when.

---

# Then sign in

1. Go to **https://pbroundrobin-admin.vercel.app**
2. Enter `jeff@positivefutures.com`
3. A six-digit code arrives by email. Enter it.

Only that address works. There is no signup, and nothing in the app links here.

---

## If something looks wrong

Paste this into the terminal:

> The admin dashboard is showing something wrong. Check the Vercel runtime logs
> for `pbroundrobin-admin`, the last few rows of `admin.job_run`, and tell me
> what broke.

The job records every run and its notes, so a failure has a written reason
rather than a blank panel.

---

## What happens on its own from here

Once a day, some time near 07:00 UTC, Vercel calls `/api/snapshot`. It writes
one row per metric per day, so a run that fires late or twice writes the same
row rather than a second copy. If a quota crosses 50% or 80% you get one email
at each, once, ever — the claim is taken in the database before the mail is
sent, so a job that runs twice cannot mail you twice.

Alerts are sent **from** `admin@roundrobinator.com`. That is not cosmetic:
`roundrobinator.com` is the only domain verified in the Resend account, and
Resend refuses a from address on any other. A personal address there would
silently kill every alert.

## What it will never show you

Daily active users, sessions created, users by country, activation, retention.
Not "not yet" — those have no source. Sessions never leave the phone they are
run on, and roughly 98% of people using the app have no account at all, so the
database knows almost nothing about them. Building those charts anyway would
produce confident wrong numbers.

Getting them needs an anonymous ping added to the main app and a paragraph
added to the privacy policy. That is a separate, deliberate decision, written up
as Option B in [../PLANS/admin-dashboard.md](../PLANS/admin-dashboard.md).
