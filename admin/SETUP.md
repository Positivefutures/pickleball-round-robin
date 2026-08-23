# Turning the admin dashboard on

A checklist. Tick a box when it is done, so putting this down for a week costs
nothing. Everything already ticked was checked against the live services on
2026-08-23, not remembered.

**Where it will live:** https://pbroundrobin-admin.vercel.app

---

## Already done

- [x] **The code is written, tested and pushed.** 29 unit tests, plus the whole
      daily job run against a throwaway Postgres.
- [x] **The Vercel project exists.** `pbroundrobin-admin`, building from this
      repo with **Root Directory `admin`**, which is the whole separation
      between it and the app. It deploys on every push to `main`.
- [x] **Both migrations are applied to the live Supabase project.** Checked by
      calling `admin_quotas()` as a stranger and getting `Not permitted.` back,
      which is the allowlist gate doing its job.
- [x] **You are on the allowlist.** `jeff@positivefutures.com`, seeded by the
      migration. Nobody else can be signed in to this.
- [x] **The nightly job's crash is fixed.** It was failing on invocation before
      it ran a line of its own code. See the note at the top of
      `api/snapshot.ts`.

## Left to do

- [ ] **Step 1** — make three tokens and paste them into `admin/.env.local`
- [ ] **Step 2** — put that same file into Vercel
- [ ] **Step 3** — ask Claude to deploy and run it
- [ ] **Step 4** — sign in and look at it

---

# Step 1 — three tokens, into `admin/.env.local`

The file already exists and is half filled in. It is gitignored, so nothing you
put in it reaches GitHub. Open it:

```
admin/.env.local
```

Four values are already there and correct: the two Supabase browser values, the
project ref, and a `CRON_SECRET` you generated last week. **Leave those alone.**

Three tokens are blank. Make each one and paste it in.

### 1a. Supabase — `SUPABASE_ACCESS_TOKEN`

1. Go to **https://supabase.com/dashboard/account/tokens**
2. **Generate new token**
3. Name it `pbrr-admin dashboard`
4. Copy it. It starts `sbp_` and **Supabase will never show it to you again.**
5. Paste it after `SUPABASE_ACCESS_TOKEN=`

There are no scopes to pick. That is worth knowing rather than glossing over:
this one token reaches every project on your Supabase account. It is here
instead of a `service_role` key because a `service_role` key would bypass every
security policy the app relies on, and one very powerful secret is easier to
keep track of than two.

### 1b. Sentry — `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`

1. Go to **https://sentry.io** and open your Round Robin project.
2. Look at the address bar. It reads something like
   `https://SOMETHING.sentry.io/projects/SOMETHINGELSE/`.
   - `SOMETHING` is your **org slug** → paste after `SENTRY_ORG=`
   - `SOMETHINGELSE` is your **project slug** → paste after `SENTRY_PROJECT=`
3. Now go to **Settings → Auth Tokens** (or
   `https://sentry.io/settings/auth-tokens/`) and **Create New Token**.
4. Tick exactly three scopes: **`org:read`**, **`project:read`**, **`event:read`**.
   Nothing else. This token can only read.
5. Copy it and paste it after `SENTRY_AUTH_TOKEN=`

If you skip Sentry entirely, everything else still works — the Crashes panel
shows dashes and the run notes say why.

### 1c. Resend — `RESEND_API_KEY`

1. Go to **https://resend.com/api-keys**
2. **Create API Key**, name it `pbrr-admin`
3. **Permission: Full access.** Not "Sending access".
4. Copy it and paste it after `RESEND_API_KEY=`

Full access is needed because the job *counts* emails sent, and counting means
listing, and a sending-only key cannot list. The cost of that is real and worth
saying out loud: a full-access key can read the body of a message you have
sent, including a sign-in code. That is why it goes into Vercel and never into
a file that is committed.

---

# Step 2 — put that file into Vercel

1. Go to
   **https://vercel.com/jeff-positivefutus-projects/pbroundrobin-admin/settings/environment-variables**
2. Open `admin/.env.local`, select all of it, copy.
3. On that Vercel page, paste into the **Key** box. Vercel recognises a whole
   `.env` file pasted in and expands it into every row at once. (If it does not,
   there is an **Import .env** control on the same page — point it at
   `admin/.env.local`.)
4. Leave every row set to all three environments (Production, Preview,
   Development).
5. **Save.**

That is 11 variables. Two of them start `VITE_` and are meant to be public — they
ship inside the page, exactly as they do in the main app. The other nine are
passwords and never leave Vercel.

---

# Step 3 — tell Claude to finish it

Paste this in:

> The admin tokens are in `admin/.env.local` and I've added all of them to the
> Vercel project. Push the fix, wait for the deploy, run `/api/snapshot` by
> hand, and tell me what the first run found.

Claude will: push, watch the build, call the job once with the `CRON_SECRET`,
check that the history actually backfilled, and report what came back — including
anything a token turned out not to be able to read.

**The first run is the first time any of this touches the live database.**
Everything so far has been proved against a throwaway copy. If something is
going to be wrong, this is when.

---

# Step 4 — sign in

1. Go to **https://pbroundrobin-admin.vercel.app**
2. Enter `jeff@positivefutures.com`
3. A six-digit code arrives by email. Enter it.

Only that address works. There is no signup, and no link to this page from
anywhere in the app.

---

## If something looks wrong

Paste this in:

> The admin dashboard is showing something wrong. Check the Vercel runtime logs
> for `pbroundrobin-admin`, the last few rows of `admin.job_run`, and tell me
> what broke.

The job records every run and its notes, so a failure has a written reason
rather than a blank panel.

---

## What happens on its own from here

Once a day, some time near 07:00 UTC, Vercel calls `/api/snapshot`. It writes
one row per metric per day, so a run that fires late or twice writes the same
row. If a quota crosses 50% or 80% you get one email at each, once, ever — the
claim is taken in the database before the email is sent, so a job that runs
twice cannot mail you twice.

## What it will never show you

Daily active users, sessions created, users by country, activation, retention.
Not "not yet" — those have no source. Sessions never leave the phone they are
run on, and roughly 98% of people using the app have no account at all, so the
database knows almost nothing about them. Building those charts anyway would
produce confident wrong numbers.

Getting them needs an anonymous ping added to the main app and a paragraph added
to the privacy policy. That is a separate, deliberate decision, written up as
Option B in [../PLANS/admin-dashboard.md](../PLANS/admin-dashboard.md).
