# The admin dashboard

A separate app, a separate Vercel project, a separate URL, and nothing in the
main app ever links to it. It reads the same Supabase project the app uses and
writes its own tables in an `admin` schema the app never touches.

The reasoning behind every choice here, including what the requirements document
got wrong about the services, is in
[PLANS/admin-dashboard.md](../PLANS/admin-dashboard.md). This file is how to run
it.

---

## What it shows today

Growth in accounts, groups and players, **backfilled to the day the first
account was made**. Room left against every quota that can actually be read, with
a runway projection. The size distributions a free tier limit would eventually
bite. Open Sentry issues.

What it does **not** show, and cannot: daily active users, sessions created,
country, activation, retention. Sessions never reach the server and most people
using the app have no account, so none of those exist to be counted. That is
step 5 of the build order, and it needs a change to the main app.

---

## Getting it running

**1. Run the two migrations**, whole, in the Supabase SQL Editor of the live
project, in order:

```
admin/supabase/migrations/A001_admin_schema.sql
admin/supabase/migrations/A002_snapshot.sql
```

They create a new schema and touch nothing the app uses. Safe to re-run.

**2. Create the tokens** listed in [.env.example](.env.example), which says what
each is for and what breaks without it.

**3. Make the Vercel project.** Same account, new project, pointed at this repo
with **Root Directory set to `admin`**. That is the whole separation: one repo,
two projects, two builds, two URLs. Add every variable from `.env.example` to
that project.

**4. Check the cron.** [vercel.json](vercel.json) asks for `/api/snapshot` once a
day. Hobby allows one run a day per job and fires within an hour of the time
asked for, which is why every metric is a daily figure and every write is an
upsert.

**5. Press it once by hand** to fill the history:

```
curl -H "Authorization: Bearer $CRON_SECRET" https://<the-url>/api/snapshot
```

The first run backfills. Later runs see the history is there and skip it.

---

## Working on it

```
npm install
npm run dev          # the dashboard
npm run build        # tsc -b && vite build
npm test             # 29 unit tests, no database needed
```

### Running the whole job for real

The unit tests cover the maths and the alerting rules. They cannot tell you
whether the SQL and the TypeScript agree, which is where every bug in this app
so far has been. For that:

```
./scripts/scratch-db.sh
cd admin
ADMIN_TEST_PG="postgres://postgres@127.0.0.1:55432/postgres" npm test
./scripts/scratch-db.sh stop
```

That builds a throwaway Postgres, stands up enough of Supabase for the app's own
nine migrations to run, applies both admin migrations, then runs the actual
daily job against it with the outside services stubbed. It needs
`brew install postgresql@17` and nothing else.

Four bugs were found this way and none of them was findable by reading:

- a function parameter that shadowed a column, so `claim_alert` threw on every
  call and no alert could ever have been sent;
- a distribution grouped one level too few, giving one row per account instead
  of one row per band;
- roster membership written as a `jsonb` containment test when `roster_ids` is a
  `text[]`;
- accounts with no groups vanishing from the distribution, which is exactly the
  band worth looking at.

---

## The shape of it

```
api/snapshot.ts        the daily job. Six steps, and step six always runs
src/server/            db routes, the three outside collectors, the alert email
src/lib/runway.ts      least squares, and four reasons to refuse to guess
src/lib/quota.ts       what a threshold crossing is
src/lib/api.ts         the browser's whole view: four gated functions
src/components/        the page
supabase/migrations/   the schema, and all the aggregation
```

Two rules worth keeping.

**All aggregation stays in SQL.** The job's entire database interaction is
`select admin.take_snapshot()`. Counting rows in Node would mean pulling them
over the wire, which is egress against a 5 GB allowance to compute a number
Postgres already knows.

**Nothing personal is ever recorded.** Not one row in the `admin` schema names a
user, an email, a group or a player. Every table holds counts. That is a
constraint on what this dashboard is allowed to become, and the place to argue
about it is the schema, not a chart.
