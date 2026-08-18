# Admin dashboard: what I found, and what I propose

Written 2026-08-18, in answer to `admin-dashboard-requirements.md`.

Read section 1 first. It is the part that changes what you are asking for.

---

## 1. Where the brief is wrong

Six things. Two of them are structural and change the shape of the build.

### 1.1 The app has no sessions on the server. None.

This is the big one.

The client writes to exactly four tables: `profiles`, `rosters`, `players`,
`preferences`. I checked every `.from(...)` call in `src/`. The schedule a host
is running, which rounds are done, who sat out, how many courts, all of it lives
in `localStorage` under `pb-schedule`, `pb-group-sessions` and friends. It is
never sent anywhere.

Your own privacy policy says so in as many words:

> The schedule you are running right now, which rounds are finished, and who has
> sat out are not part of it. They stay on the device that built them.

The one exception is `shared_sessions`, which is written only when a host taps
Share, and which is **deleted** when they tap Stop Sharing, and expires on a
timer besides. So it is not a record of sessions run. It is a record of sessions
currently being watched, which is a much smaller and stranger number.

**So "sessions created over time" cannot be measured today, at all, by anything.**
Nor can activation rate, session frequency per organizer, or anything else that
counts sessions.

### 1.2 Most of your users do not have accounts, and cannot be counted

The app works with no account. That is the default, it is the thing the privacy
policy leads with, and it is how nearly everyone uses it.

`docs/costs-and-limits.md`, measured against the live project on 2026-08-09:

| | |
|---|---|
| Accounts | **3** |
| Groups | 13 |
| Players | 62 |

Nine days ago there were three accounts. You told me roughly 150 users. Both
numbers are probably right, because they are counting different things. The 150
is almost certainly visitors in the Vercel dashboard, which counts browsers, not
people, and includes you, me, and every device you have ever tested on.

**"Total users" is not a database question.** The database knows about the ~2%
who signed up. Any growth chart built only from Supabase is a chart of how the
account feature is doing, not how the app is doing.

### 1.3 Vercel Analytics has no API on your plan. I tried it.

Your table says the Web Analytics API covers pageviews and visitors with
grouping by country. It does, on Pro. You are on Hobby.

I called the Web Analytics endpoint against your project just now, twice, with
different date ranges:

```
404 Not Found  {"error":{"code":"not_found","message":"Web Analytics not found."}}
```

Web Analytics itself is definitely on. Your checklist records you enabling it and
verifying `/_vercel/insights/script.js` returns 200, and `<Analytics />` is
mounted in `src/main.tsx:71`. It is the query API that is not available.

From Vercel's own pricing table for Web Analytics:

| | Hobby | Pro |
|---|---|---|
| Reporting window | **1 month** | 12 months |
| Custom events | **not available** | included |

So on Hobby you get: a dashboard you have to look at with your eyes, one month
of history, and no `track()` calls. Country data is visible on that dashboard and
nowhere a program can reach.

Getting Vercel's analytics into your dashboard costs **$20/month**. I do not
think you should pay it, for reasons in section 3.

### 1.4 There is no Supabase "project usage" endpoint

Your table says the Management API has project usage endpoints. I pulled the
full OpenAPI spec (115 paths). There is no `/v1/projects/{ref}/usage`. What
actually exists that is useful:

| Endpoint | Gives you |
|---|---|
| `POST /v1/projects/{ref}/database/query/read-only` | **Arbitrary read-only SQL.** This is the good one |
| `GET /v1/projects/{ref}/readonly` | Whether the 500 MB ceiling has already bitten |
| `GET /v1/projects/{ref}/health` | Whether the project is up or paused |
| `GET /v1/projects/{ref}/analytics/endpoints/usage.api-counts` | API request counts |
| `GET /v1/projects/{ref}/advisors/security` | Free security audit, worth a panel |

There is **no egress endpoint and no MAU endpoint.** Egress against the 5 GB
limit is the one number in your brief I cannot get by any route. MAU I can
compute myself from `auth.users.last_sign_in_at`, which is what Supabase is
counting anyway.

Database size does not need an API at all. `select pg_database_size(current_database())`
is exact, free, and more trustworthy than a billing figure that lags.

### 1.5 Resend is better than you thought, with one catch

There is no usage endpoint, you are right. But `GET /emails` lists sent emails
with `created_at` and cursor pagination, so counting sends per day is a loop, not
a new table.

**The catch, and it needs checking on day one:** your sign-in codes go out through
Resend as Supabase's SMTP relay, not through the Resend API. Emails sent over SMTP
may not appear in the Emails API listing. If they do not, that listing counts your
feedback emails and misses the sign-in codes, which are the whole reason the 100/day
limit matters. One curl with your key settles it.

Also worth saying: **the alert emails this dashboard sends come out of the same
100/day budget as your sign-in codes.** A chatty alerting system would eat the
thing it is protecting. The design in section 4 sends at most a handful a month.

### 1.6 One accidental bonus

`docs/costs-and-limits.md` names the single most likely way this app breaks:

> Supabase pauses free projects that go quiet. If a free project gets too little
> database activity over a 7-day period, they pause it.

A daily snapshot job is database activity, every day, forever. **Building this
dashboard fixes the failure mode you were most exposed to,** as a side effect.
That alone is worth the build.

---

## 2. The fork in the road

Everything above collapses into one decision, and I cannot make it for you.

### Option A: measure only what exists

The admin app reads Supabase and nothing else. You get:

- Accounts, and signups over time, **backfilled to day one** from `auth.users.created_at`
- Groups and players over time, backfilled from their `created_at`
- Group and roster size distributions (real, and directly useful for free tier limits)
- "Last synced" per account, derived, no schema change needed
- Sharing activity
- Database size, MAU, project health, all against their ceilings
- Sentry issues and error trend
- Runway projections on everything above

You do **not** get: daily active users across the whole app, sessions created,
activation rate, retention cohorts, session frequency, or country.

Cost: nothing. Privacy policy: unchanged. Main app: unchanged.

### Option B: add an anonymous usage ping to the main app

A single endpoint in the main app, `api/ping.ts`, next to the feedback function
you already have. The app calls it when it opens and when a schedule is
generated. It records:

- The date
- A random install id, minted in `localStorage`, tied to no person and no account
- The country, read from `x-vercel-ip-country`, which Vercel gives every function
  for free on Hobby
- Which of the two things happened
- Coarse size bands, such as "9 to 12 players", never exact rosters

No names. No player data. No IP stored. No account link. No third party involved,
because it is your own function writing to your own database.

That gets you the whole of Requirement 3: real DAU across everyone including the
98% with no account, sessions created, country, activation rate, retention
cohorts, and session frequency.

**What it costs you honestly:**

1. **A privacy policy change.** A new section, in the same plain voice as the
   rest. The current policy's strongest sentence is "if you never make one,
   nothing you type ever leaves your device." After this, that sentence needs a
   caveat, and the caveat is the price. It stays true of everything they *type*.
   It stops being true of the bare fact that the app was opened.
2. **A pseudonymous identifier.** You ruled out user-level behavioural tracking,
   and I want to be straight with you: an install id is not that, but it is
   adjacent to it. It is a random number in one browser, it says nothing about a
   person, and it never joins to an account. But it is stable, and stable is what
   makes retention possible. **There is no way to compute a retention cohort
   without something stable.** If that is over your line, say so and we do B-lite:
   counters with no id at all, which gives sessions per day and country but kills
   DAU, retention, activation and frequency.
3. About 200 lines in the main app, and a `vercel.json` for the function.

**My recommendation: A now, B immediately after, as separate shipped steps.**

A is a week of work that stands on its own, and it makes the project safe from
the pause. B is the difference between a dashboard that tells you how the signup
form is doing and one that answers your Outcome 1, which was "can I tell at a
glance whether the app is growing or dying". Option A cannot answer that. It is
worth being blunt about it, because the whole document was written around that
question.

---

## 3. Architecture

```
                     ┌──────────────────────────────────┐
   Vercel Cron       │  admin project (Vercel, Hobby)   │
   once a day  ────► │  api/snapshot.ts                 │
   (Hobby max)       │    reads Supabase, Sentry, Resend│
                     │    writes one row per metric/day │
                     │    checks thresholds, sends mail │
                     └───────────────┬──────────────────┘
                                     │
                     ┌───────────────▼──────────────────┐
                     │  Supabase, schema `admin`        │
                     │    metric_daily   (the facts)    │
                     │    quota_limit    (the ceilings) │
                     │    alert_sent     (anti-spam)    │
                     │    allowlist      (who is admin) │
                     └───────────────┬──────────────────┘
                                     │  read only, via one
                                     │  security definer fn
                     ┌───────────────▼──────────────────┐
                     │  admin dashboard (React + Vite)  │
                     │    charts, quota bars, runway    │
                     │    Supabase OTP sign-in          │
                     └──────────────────────────────────┘
```

Four decisions worth defending.

**The snapshot job does all the aggregation; the dashboard reads one table.**
That satisfies Requirement 2 properly, keeps raw user data out of the browser,
makes the page fast, and leaves a single tidy fact table that a chat layer could
sit on later without redesign.

**A new `admin` schema, not `public`.** PostgREST only exposes schemas it is told
about. Putting these tables outside `public` means they are not reachable over the
API at all, by anyone, before RLS is even considered. Belt, then braces.

**Same Supabase project.** A second free project is a second thing that gets
paused for inactivity, and it could not join to the app's own data. There is no
upside.

**No service_role key anywhere.** The snapshot job talks to Supabase through the
Management API's read-only SQL endpoint using your personal access token, and
writes its results through one narrow `security definer` function. A service_role
key is a total RLS bypass sitting in an env var; this avoids minting one.

### Auth: how you and only you get in

My recommendation: **Supabase OTP, same as the main app, with the allowlist
enforced in Postgres.**

You type your email at the admin URL, you get a six digit code, you are in. It
reuses a sign-in flow that already exists and is already proven, it costs nothing,
and the session lasts so you are not doing it often.

The part that matters: the check is not in the JavaScript. Every function the
dashboard calls opens with

```sql
if (select auth.jwt() ->> 'email') not in (select email from admin.allowlist)
then raise exception 'not permitted'; end if;
```

So the admin app's URL leaking is not a breach. Anyone who finds it and signs in
with their own account gets an error and nothing else. The database is the gate,
not the bundle.

Two alternatives I considered and rejected: Vercel Deployment Protection, because
protecting a *production* deployment is a paid feature and the free version only
covers previews; and a shared secret in an env var, because it is one paste in a
Slack away from being public and it cannot tell you apart from whoever it leaked to.

The admin app is a separate Vercel project on a separate URL, deployed from a
separate directory, and nothing in the main app ever links to it. Suggest
`admin.pbroundrobin.com`, or leave it on the `.vercel.app` URL, which is honestly
fine given the database is the real gate.

---

## 4. Data model

```sql
create schema admin;

-- The fact table. One row per metric per day. Deliberately narrow: adding a
-- metric is an insert, never a migration.
create table admin.metric_daily (
  day         date    not null,
  metric      text    not null,   -- 'accounts_total', 'sessions_created', ...
  dimension   text    not null default '',  -- '' or a country code, etc
  value       numeric not null,
  captured_at timestamptz not null default now(),
  primary key (day, metric, dimension)
);

-- The ceilings, as data rather than as constants in code, so raising one when
-- you upgrade a plan is an update rather than a deploy.
create table admin.quota_limit (
  metric     text primary key,
  ceiling    numeric not null,
  unit       text    not null,
  period     text    not null,     -- 'monthly' | 'daily' | 'absolute'
  service    text    not null,     -- 'supabase' | 'vercel' | 'resend' | 'sentry'
  note       text
);

-- One row per threshold crossed per period. The unique key IS the anti-spam
-- mechanism: the job tries to insert before it sends, and a conflict means it
-- already told you.
create table admin.alert_sent (
  metric     text not null,
  threshold  int  not null,        -- 50 or 80
  period_key text not null,        -- '2026-08' for monthly, '2026-08-18' for daily
  sent_at    timestamptz not null default now(),
  primary key (metric, threshold, period_key)
);

create table admin.allowlist (email text primary key);
insert into admin.allowlist values ('jeff@positivefutures.com');
```

`metric_daily` being long and narrow rather than wide is the thing that keeps
this cheap. A hundred metrics for ten years is 365,000 rows, which is a few
megabytes against a 500 MB ceiling.

### The metrics, and where each one comes from

| Metric | Source | Backfillable? | Needs the ping? |
|---|---|---|---|
| Accounts total, new accounts | `auth.users.created_at` | **Yes, to day one** | no |
| Groups, players, both over time | `rosters` / `players.created_at` | **Yes, to day one** | no |
| Group size distribution | `players` grouped by roster | Yes | no |
| Accounts that synced recently | `max(server_updated_at)` per user | **No.** See below | no |
| Signed in this month (Supabase MAU) | `auth.users.last_sign_in_at` | No, only current | no |
| Shares started | `shared_sessions.created_at` | Partly. Rows are deleted on Stop | no |
| Database size | `pg_database_size()` | No | no |
| Project read-only / paused | Management API | No | no |
| Sentry events, issues, trend | `stats_v2` + issues API | ~90 days | no |
| Resend sends today / this month | `GET /emails` | Yes, from their history | no |
| **Daily active users** | ping | No | **yes** |
| **Sessions created** | ping | No | **yes** |
| **Country breakdown** | ping | No | **yes** |
| **Activation rate** | ping | No | **yes** |
| **Retention cohorts** | ping | No | **yes** |
| **Sessions per organizer** | ping | No | **yes** |
| Vercel bandwidth / requests | *nothing* | No | Pro, $20/mo |
| Supabase egress | *nothing* | No | never |

Backfill note, corrected after building it and running it against a real
Postgres.

Signups, groups and players reconstruct **completely**, and better than I first
thought. Because 0001 keeps tombstones rather than deleting rows, `deleted_at`
survives, so "how many live groups existed on 3 June" is answerable exactly, and
a group deleted in July still counts as live in June. Verified on a seeded
database: the reconstructed series shows the player count dropping on the exact
day a player was deleted, and the group count dropping on the day a group was.

**I was wrong about last-synced in the first draft of this table.** I wrote that
it backfills to day one. It does not. `server_updated_at` is overwritten on every
change, so all it holds is the *most recent* touch per account. You can therefore
say "N accounts have been active in the last 30 days" today, and you can say
"account X was last active on day D", but you cannot say how many were active on
some past Tuesday, because anyone active that Tuesday and again since has had
their timestamp overwritten. Best available historically is a lower bound, which
is not worth charting. Recorded from today forward instead.

DAU cannot be backfilled by anything, for the same reason applied to
`last_sign_in_at`.

---

## 5. Last-seen: you may not need the schema change

You flagged this as a prerequisite and asked me to confirm before touching the
main app's schema. **I do not think you need to touch it.**

There are three different meanings of "active" here, and you are right that you
want more than one.

**1. Signed in.** `auth.users.last_sign_in_at` already exists. Free, zero change.
Its weakness is that people stay signed in for weeks, so it fires rarely and
badly undercounts.

**2. Used their account.** Take `max(server_updated_at)` across `rosters`,
`players` and `preferences` for each user. That column already exists on all
three, it is already maintained by a trigger, and it is already indexed for
`rosters` and `players`. **This is a real last-seen and it needs no migration.**
Its weakness is that it only moves when data changes, so a host who runs an
afternoon without editing their roster looks idle.

**3. Ran a session.** The one you actually want, and the only honest answer to
"are people using this". It cannot come from the schema at any price, because
sessions are not in the schema. It needs the ping.

So: **no column on `profiles`.** Meaning 2 is free and available today, and if we
do the ping, the ping table is a better home for meaning 3 than a column on a
table that only 3 people have a row in. That is one main app migration you were
braced for that you do not have to run.

For the dashboard I would show both 2 and 3, labelled plainly. "Accounts that
synced" and "People who ran a session" are different questions and neither is a
substitute for the other.

---

## 6. Quota monitoring, and the runway

### Alerting without spam

The `alert_sent` primary key does the work. Before sending, the job attempts
`insert ... on conflict do nothing`. If it inserted, it sends. If it conflicted,
you have already been told and it stays quiet. `period_key` resets monthly for
monthly quotas, so a new month can alert again, and a metric that drops back below
50% and rises again within the same month does not.

At most 8 emails a month exist in the whole design, if every single quota crossed
both thresholds, which will not happen.

### Runway projection

Least-squares fit over the trailing 28 snapshots, per metric, extrapolated to the
ceiling. Rendered as "crosses 500 MB around 12 March 2027".

The guard matters more than the maths: **if the slope is flat or negative, or the
fit is poor, it says "no trend" rather than inventing a date.** A confidently
wrong runway date is worse than no runway date, and with your current numbers
almost every line will legitimately read "no trend" for a long time. That is the
correct answer and the dashboard should say it without embarrassment.

### What the quota panel can honestly show

| Service | Metric | Status |
|---|---|---|
| Supabase | Database size vs 500 MB | **Exact**, from SQL |
| Supabase | MAU vs 50,000 | **Exact**, computed from `auth.users` |
| Supabase | Read-only mode | **Exact**, from the API |
| Supabase | Days since last DB activity, vs the 7-day pause | **Exact**, and the most useful number on the page |
| Supabase | Egress vs 5 GB | **Not available.** Nothing exposes it |
| Resend | Sends today vs 100, month vs 3,000 | Exact, if SMTP sends appear in the API. To verify |
| Sentry | Events this month vs 5,000 | **Exact**, from `stats_v2` |
| Vercel | Bandwidth, requests, analytics events | **Not available on Hobby** |

I would put the two unavailable ones on the dashboard as explicit "not available
on the free plan, check the dashboard monthly" cards, with a link. An empty space
gets forgotten; a card that admits what it does not know does not.

---

## 7. Tokens to create

| # | Service | What to make | Scopes | Where it goes |
|---|---|---|---|---|
| 1 | Supabase | Personal access token, Account → Access Tokens. Starts `sbp_` | None to choose. **Account-wide, treat it as a root password** | admin project env only |
| 2 | Supabase | The project ref, from the dashboard URL | n/a | admin project env |
| 3 | Sentry | Organization auth token, Settings → Developer Settings, or an Internal Integration | `org:read`, `project:read`, `event:read` | admin project env |
| 4 | Sentry | Your org slug and project slug | n/a | admin project env |
| 5 | Resend | API key, **Full access** (Sending access cannot list emails) | Full access | admin project env |
| 6 | Vercel | **None.** I verified the analytics API 404s on Hobby | | |

Two notes. The Supabase PAT is the most powerful credential in this list by a
distance, since it reaches every project on your account; it belongs in Vercel's
env vars for the admin project and nowhere else, never in a file. And the Resend
full-access key can read the bodies of sent emails, including sign-in codes, so it
gets the same treatment.

I will add all six to `.env.example` in the admin project with the same commentary
style the main app's uses, so what each one is for is written down next to it.

---

## 8. Privacy

**Option A changes nothing.** Everything it reads is data the policy already
discloses, and it is read by you, the person the policy already names as the one
running the app.

**Option B needs a new section in `public/privacy.html`.** Roughly:

> ### Counting how the app is used
>
> The app tells my own server when it is opened and when a schedule is made. It
> sends the date, the country, and a random number that identifies the browser,
> not you. It does not send your name, your players, your groups, or anything you
> typed. Nothing goes to another company, and nothing is joined to your account.

`src/lib/privacy.test.ts` already guards the list of processors in that file. The
ping introduces no new processor, since it is your own function and your own
database, so that test stays green. I would add a test that this section exists,
in the same spirit.

Note also that `docs/costs-and-limits.md` and the launch checklist should get the
result of this work folded in. Item 17, "Product analytics", is essentially this
document's Option B, and it says "whatever is chosen gets disclosed in the privacy
policy" already.

---

## 9. Build order

Highest value first, each step shipping something usable on its own.

**Step 1. Skeleton, auth, and the daily job.** New Vercel project, the `admin`
schema, OTP sign-in with the allowlist enforced in Postgres, the snapshot cron,
and the full backfill from `created_at`. **Ships: real growth charts with history
back to day one, and the project can no longer be paused for inactivity.**

**Step 2. Quotas, alerts, runway.** Database size, MAU, Sentry, Resend, days
since activity. The 50/80 emails. The projections with the flat-trend guard.
**Ships: Requirement 4, and you stop being able to be caught out.**

**Step 3. The dashboard proper.** Charts, the at-a-glance top strip, quota bars.
Clarity over density, as asked.

**Step 4. Sentry panel.** Open issues, frequency, trending up or down. Then turn
off the per-error emails in Sentry, which is a change in their dashboard and
therefore yours to make, and replace them with a weekly digest from the cron.

**Step 5. The ping**, if you say yes. Main app change, privacy policy change,
then DAU, sessions, country, activation, retention, frequency.

**Step 6. Stripe metrics** when subscriptions exist. The `profiles` table already
has the reserved columns, so this is a query, not a migration.

Steps 1 and 2 are the ones that pay for themselves immediately. Step 5 is the one
that answers the question you actually opened the document with.

---

## 10. Decisions taken, 2026-08-18

Answered by Jeff before the build started:

- **Option A now, Option B as a separate step afterwards.** So steps 1 to 4 are
  built and step 5 waits for a go-ahead and a privacy policy change.
- **The default `.vercel.app` URL**, no custom subdomain. The Postgres allowlist
  is the gate either way.
- **Sentry: a dashboard panel only.** No digest email, and nothing changes in
  Sentry's own settings. The per-error emails stay as they are.

## 11. Built so far

Steps 1 and 2 of the build order, plus most of step 3. It lives in `admin/` and
deploys as a second Vercel project with Root Directory set to `admin`. See
[admin/README.md](../admin/README.md) to run it.

Everything below was run, not just written. `admin/scripts/scratch-db.sh` builds
a throwaway Postgres, stands up enough of Supabase for the app's own nine
migrations to apply, applies both admin migrations, and the test suite then runs
the actual daily job against it with the outside services stubbed. 33 tests.

Proved rather than asserted:

- The allowlist gate refuses `anon`, refuses an `authenticated` user with the
  wrong email, and admits the right one. Both barriers hold independently: with
  the function grant removed the schema permission still refuses, and vice versa.
- The backfill reconstructs 40 days of history exactly, including a group
  deleted mid-history and a player deleted five days ago.
- The job is safe to run twice, which is what a Hobby cron requires.
- An alert fires once and then stays silent for the same crossing in the same
  period.
- Eight deliberate sabotages of the runway and quota guards each turn the suite
  red. A ninth did not, which showed that one branch was defensive rather than
  load-bearing; the comment now says so instead of claiming coverage it lacks.

Four bugs were caught by running it, none of them visible by reading: a
parameter that shadowed a column so `claim_alert` threw on every call, a
distribution grouped one level too few, roster membership tested as `jsonb` when
the column is a `text[]`, and accounts with zero groups vanishing from the
distribution that is meant to show them.

Not built: step 5 (the ping) awaiting your decision, and step 6 (Stripe) awaiting
subscriptions.

## 12. What I still need from you

Nothing blocks the code, but these block it going live.

1. **The tokens in section 7.** The app is written and tested; it has never
   spoken to the live project, because I have no credentials for it.
2. **Where did 150 come from?** If it is the Vercel visitors number, I will label
   it on the dashboard as "visitors, which is browsers not people".
3. **How many accounts are there today?** Paste this into the Supabase SQL editor:
   ```sql
   select
     (select count(*) from auth.users)                         as accounts,
     (select count(*) from auth.users
        where last_sign_in_at > now() - interval '30 days')    as signed_in_30d,
     (select count(*) from public.rosters where deleted_at is null) as groups,
     (select count(*) from public.players where deleted_at is null) as players,
     (select count(*) from public.shared_sessions)             as live_shares,
     pg_size_pretty(pg_database_size(current_database()))      as db_size;
   ```
4. **The Resend SMTP question** in 1.5, which is the one open unknown in the
   build. The job counts emails through `GET /emails`, and if Supabase's SMTP
   relay sends do not appear there, that count misses the sign-in codes. The
   dashboard already labels the figure as possibly partial, and there is a
   `resend_listing_may_be_partial` metric carrying that caveat, so it fails
   honestly rather than quietly. Settling it is one call:
   ```
   curl -s https://api.resend.com/emails \
     -H "Authorization: Bearer re_xxx" -H "User-Agent: pbrr/1.0" | head -c 2000
   ```
   If the sign-in codes are in there, I delete the caveat. If they are not, the
   fallback is logging our own sends, which is what your brief originally
   assumed.

5. **Option B, when you are ready.** Section 2. Everything above is built and
   none of it answers "is the app growing or dying", because that question is
   about the people with no account.

Everything else I have an answer for and have proceeded on.
