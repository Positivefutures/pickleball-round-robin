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

## Your five tasks

- [ ] **Task 1** — paste six settings into Vercel *(you, 2 min)*
- [ ] **Task 2** — Supabase token *(Claude in Chrome)*
- [ ] **Task 3** — Sentry token *(Claude in Chrome)*
- [ ] **Task 4** — Resend key *(Claude in Chrome)*
- [ ] **Task 5** — tell Claude Code to finish it *(one paste)*

Then sign in. Tasks 2, 3 and 4 are independent of each other, so their order
does not matter. Task 1 should come before Task 5.

---

# Task 1 — paste six settings into Vercel

**You do this one**, because the values are already sitting on your machine and
copying a file is faster than describing it to anything.

1. Open **`admin/.env.local`**.
2. It has two blocks. Select **Block 1** — the six lines from
   `VITE_SUPABASE_URL` down to `CRON_SECRET` — and copy them.
3. Go to
   **https://vercel.com/jeff-positivefutus-projects/pbroundrobin-admin/settings/environment-variables**
4. Paste into the **Key** box. Vercel recognises a pasted `.env` and expands it
   into six rows at once. If it does not, there is an **Import .env** control on
   the same page.
5. Leave every row ticked for all three environments (Production, Preview,
   Development).
6. **Save.**

Two of those start `VITE_` and are meant to be public — they ship inside the
page, exactly as they do in the main app. `CRON_SECRET` is the one real secret
in the batch, and it never leaves Vercel.

---

# Tasks 2 to 4 — Claude in Chrome

Each is a self-contained prompt. Open Claude in Chrome and paste one, wait for
it to finish, then paste the next.

**Watch these rather than walking away.** Two of the three tokens are genuinely
powerful, and the prompts say so where it matters.

---

## Task 2 — the Supabase token

> Please do this in two parts, and stop and tell me if anything does not match
> what I describe.
>
> **Part one.** Go to https://supabase.com/dashboard/account/tokens and generate
> a new personal access token named `pbrr-admin dashboard`. Copy the value it
> shows you — it starts with `sbp_` and Supabase never shows it again.
>
> **Part two.** Go to
> https://vercel.com/jeff-positivefutus-projects/pbroundrobin-admin/settings/environment-variables
> and add a new environment variable with the key `SUPABASE_ACCESS_TOKEN` and
> that token as its value. Tick all three environments — Production, Preview and
> Development. Save it.
>
> Then tell me it is done. Do not paste the token into this chat.

There are no scopes to choose on a Supabase token, and that is worth knowing
rather than glossing over: this one credential reaches every project on the
account. It is here instead of a `service_role` key because a `service_role`
key would bypass every security policy the app relies on, and one very powerful
secret is easier to keep track of than two.

---

## Task 3 — the Sentry token and two names

> Please do this in three parts, and stop and tell me if anything does not match
> what I describe.
>
> **Part one.** Go to https://sentry.io and open my Round Robin project. Read
> the address bar: it will look like
> `https://SOMETHING.sentry.io/projects/SOMETHINGELSE/`. `SOMETHING` is the org
> slug and `SOMETHINGELSE` is the project slug. Tell me both — these are names,
> not secrets.
>
> **Part two.** Go to https://sentry.io/settings/auth-tokens/ and create a new
> organization auth token named `pbrr-admin`. Give it exactly three scopes and
> nothing else: `org:read`, `project:read`, `event:read`. If you cannot find one
> of those three, stop and tell me rather than picking something similar. Copy
> the token.
>
> **Part three.** Go to
> https://vercel.com/jeff-positivefutus-projects/pbroundrobin-admin/settings/environment-variables
> and add three environment variables, each ticked for Production, Preview and
> Development:
>
> - `SENTRY_AUTH_TOKEN` — the token from part two
> - `SENTRY_ORG` — the org slug from part one
> - `SENTRY_PROJECT` — the project slug from part one
>
> Save, then tell me the two slugs and that it is done. Do not paste the token
> into this chat.

Those three scopes are all read. If Sentry turns out to be more trouble than it
is worth, skip this task entirely — everything else still works, the Crashes
panel shows dashes, and the run notes say why.

---

## Task 4 — the Resend key

> Please do this in two parts, and stop and tell me if anything does not match
> what I describe.
>
> **Part one.** Go to https://resend.com/api-keys and create a new API key named
> `pbrr-admin`. Set its permission to **Full access**, not "Sending access".
> Copy the value.
>
> **Part two.** Go to
> https://vercel.com/jeff-positivefutus-projects/pbroundrobin-admin/settings/environment-variables
> and add a new environment variable with the key `RESEND_API_KEY` and that key
> as its value, ticked for Production, Preview and Development. Save it.
>
> Then tell me it is done. Do not paste the key into this chat.

Full access is needed because the job *counts* emails sent, counting means
listing, and a sending-only key cannot list. The cost of that is real: a
full-access key can read the body of a message already sent, including a
sign-in code. That is exactly why it goes into Vercel and nowhere else.

---

# Task 5 — tell Claude Code to finish it

Come back to the terminal and paste this:

> Task 1 is done and Claude in Chrome has added the Supabase, Sentry and Resend
> variables to Vercel. Push the fix, wait for the deploy, run `/api/snapshot` by
> hand, and tell me what the first run found.

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
