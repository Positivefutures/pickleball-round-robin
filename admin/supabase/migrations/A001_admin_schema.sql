-- ============================================================================
-- A001_admin_schema.sql
--
-- The admin dashboard's own tables, and the gate that decides who may read
-- them. Run it once, whole, in the Supabase SQL Editor of the same project the
-- app uses. It touches nothing the app touches.
--
-- The A prefix keeps these apart from the app's own 0001..0009. They are not
-- the same sequence and should never be renumbered into one: the app's
-- migrations must be runnable on a database that has never heard of this
-- dashboard.
--
-- ## Why a separate schema
--
-- PostgREST serves the schemas it is configured to serve, which here is
-- `public` and nothing else. Tables in `admin` are therefore not reachable over
-- the API at all, by anon or by anybody, before a single policy is considered.
-- That is the first of two barriers and it is the cheap one.
--
-- The second is that the only way in is through the four functions at the
-- bottom of this file, each of which refuses a caller who is not on the
-- allowlist. Losing either barrier alone still leaves the data covered.
--
-- ## What is not here
--
-- No personal data. Not one row in this schema names a user, an account, an
-- email, a player or a group. Every table below holds counts. That is a
-- deliberate constraint on what the dashboard is allowed to become, and the
-- place to push back is here, at the schema, rather than later at a chart.
-- ============================================================================

create schema if not exists admin;

-- Nothing in this schema is for the app's roles. Revoking on the schema stops
-- a later `grant all on all tables` in some other migration from quietly
-- opening it up, because usage on the schema is checked first.
revoke all on schema admin from anon, authenticated;


-- ---------------------------------------------------------------- allowlist --
-- Who may read the dashboard. A table rather than a constant in a function,
-- because adding a second pair of eyes one day should be an insert rather than
-- a migration, and because a hardcoded address in a definer function is the
-- kind of thing that gets copied into a second function and then drifts.
--
-- One row today, and that is the intended steady state.
create table if not exists admin.allowlist (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

insert into admin.allowlist (email, note)
values ('jeff@positivefutures.com', 'Owner. The only account this is built for.')
on conflict (email) do nothing;


-- -------------------------------------------------------------- metric_daily --
-- The whole history, one row per metric per day.
--
-- Long and narrow rather than a wide table with a column per metric. Three
-- reasons, in order of how much they matter:
--
--   1. Adding a metric is an insert. A wide table would need a migration every
--      time the dashboard learned to count something new, and a migration is
--      the thing most likely to be skipped in a hurry.
--   2. The primary key makes the daily job idempotent. Vercel's Hobby cron
--      fires once a day with an hour of slop and can in principle fire twice;
--      an upsert on (day, metric, dimension) means a second run corrects the
--      first rather than doubling it.
--   3. A metric that has a breakdown and one that does not are the same shape.
--      `dimension` is '' for a plain count and a country code, a size band or a
--      cohort month otherwise. No nulls, so the primary key works without a
--      partial index and `where dimension = ''` never surprises anybody.
--
-- Size: a hundred metrics a day for ten years is around 365,000 rows, which is
-- single-digit megabytes against a 500 MB ceiling. This table is not going to
-- be the thing that fills the database. See docs/costs-and-limits.md.
create table if not exists admin.metric_daily (
  day         date    not null,
  metric      text    not null,
  dimension   text    not null default '',
  value       numeric not null,
  captured_at timestamptz not null default now(),
  primary key (day, metric, dimension)
);

-- The dashboard's only read pattern: one metric, a date range, in order.
create index if not exists metric_daily_metric_day_idx
  on admin.metric_daily (metric, day);


-- --------------------------------------------------------------- quota_limit --
-- The ceilings, as data.
--
-- These live in a table rather than in the TypeScript because the day a plan is
-- upgraded is a day of relief, not a day anybody wants to be deploying. Raising
-- a ceiling is an update.
--
-- `available` is the honest column. Two of these numbers cannot be read by any
-- API on the free plan, and a dashboard that shows an empty bar next to a real
-- one teaches you to distrust both. Marked false, they render as a card that
-- says so and links to the dashboard that does know.
create table if not exists admin.quota_limit (
  metric    text primary key,
  service   text    not null,
  ceiling   numeric not null,
  unit      text    not null,
  period    text    not null,            -- 'daily' | 'monthly' | 'absolute'
  available boolean not null default true,
  note      text
);

insert into admin.quota_limit (metric, service, ceiling, unit, period, available, note) values
  ('supabase_db_bytes',      'supabase', 524288000, 'bytes', 'absolute', true,
   'Exceeding it puts the project into read-only mode after a grace period.'),
  ('supabase_mau',           'supabase', 50000,     'people','monthly',  true,
   'Counted here as accounts with a sign-in in the trailing 30 days.'),
  ('supabase_egress_bytes',  'supabase', 5368709120,'bytes', 'monthly',  false,
   'No Management API endpoint exposes this. Check the Supabase usage page.'),
  ('resend_sends_day',       'resend',   100,       'emails','daily',    true,
   'Shared with sign-in codes. A flood here stops people signing in.'),
  ('resend_sends_month',     'resend',   3000,      'emails','monthly',  true,
   'Shared with sign-in codes.'),
  ('sentry_events_month',    'sentry',   5000,      'events','monthly',  true,
   'Later crashes are dropped silently rather than billed.'),
  ('vercel_bandwidth_bytes', 'vercel',   107374182400, 'bytes','monthly', false,
   'The Web Analytics and usage APIs are not available on Hobby. Verified 2026-08-18.'),
  ('vercel_analytics_events','vercel',   50000,     'events','monthly',  false,
   'Same. Collection pauses at the ceiling rather than billing.')
on conflict (metric) do nothing;


-- ---------------------------------------------------------------- alert_sent --
-- One row per threshold crossed per period. This table IS the anti-spam rule.
--
-- The job does not compare against a previous reading and try to work out
-- whether a line has been crossed since yesterday, which is the obvious design
-- and which goes wrong the first time a snapshot is missed. It attempts an
-- insert here, and sends only if the insert took. A conflict means you have
-- already been told.
--
-- `period_key` is what resets it: '2026-08' for a monthly quota, '2026-08-18'
-- for a daily one, and 'once' for an absolute one. So August's 80% warning does
-- not repeat in August, does fire again in September, and a metric that dips
-- under 50 and back over within the same month stays quiet.
create table if not exists admin.alert_sent (
  metric     text not null,
  threshold  int  not null check (threshold in (50, 80)),
  period_key text not null,
  value      numeric,
  ceiling    numeric,
  sent_at    timestamptz not null default now(),
  primary key (metric, threshold, period_key)
);


-- ------------------------------------------------------------------ job_run --
-- Did the snapshot run, and did it work. Without this the failure mode is
-- silence, which is the same shape as everything being fine.
--
-- The dashboard shows the last run at the top. A job that has not run in two
-- days is the first thing worth knowing, ahead of any metric on the page.
create table if not exists admin.job_run (
  id         bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  ok         boolean,
  detail     jsonb,
  ms         int
);

create index if not exists job_run_started_idx on admin.job_run (started_at desc);


-- ============================================================================
-- The gate.
--
-- Everything below is `security definer`, which means it runs as the owner and
-- can therefore see the admin schema that the caller cannot. That is the whole
-- point, and it is also why each one has to check for itself who is calling.
--
-- `set search_path = ''` and fully qualified names throughout, the same as
-- handle_new_user() in 0001 and shared_session() in 0005. An unqualified name
-- in a definer function is how search-path injection gets in.
-- ============================================================================

-- The check, once, so there is one copy of it to get right.
--
-- Reading the email from the JWT rather than joining auth.users on auth.uid():
-- both work, this one is a single claim read with no table access, and it fails
-- closed when there is no JWT at all because null is not in any allowlist.
create or replace function admin.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from admin.allowlist a
    where a.email = (select auth.jwt() ->> 'email')
  );
$$;

-- Raise rather than return empty. An empty result and a refusal look identical
-- from the browser, and the difference matters when something is misconfigured
-- at three in the afternoon before a game.
create or replace function admin.require_admin()
returns void
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not admin.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
end;
$$;


-- ------------------------------------------------------ what the browser calls --
-- These four live in `public` because that is the schema PostgREST serves. They
-- are the entire surface of this dashboard, and each one refuses first and works
-- second.
--
-- Named with an admin_ prefix so that anyone reading the app's own API surface
-- can see immediately that these are not the app's.

create or replace function public.admin_metrics(since date, until date)
returns table (day date, metric text, dimension text, value numeric)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  perform admin.require_admin();
  return query
    select m.day, m.metric, m.dimension, m.value
    from admin.metric_daily m
    where m.day between since and until
    order by m.metric, m.dimension, m.day;
end;
$$;

create or replace function public.admin_quotas()
returns table (
  metric text, service text, ceiling numeric, unit text,
  period text, available boolean, note text, value numeric, as_of date
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  perform admin.require_admin();
  return query
    select q.metric, q.service, q.ceiling, q.unit, q.period, q.available, q.note,
           latest.value, latest.day
    from admin.quota_limit q
    -- The most recent reading for each quota, which for a monthly figure is a
    -- month-to-date total and for an absolute one is simply the latest.
    left join lateral (
      select m.value, m.day
      from admin.metric_daily m
      where m.metric = q.metric and m.dimension = ''
      order by m.day desc
      limit 1
    ) latest on true
    order by q.service, q.metric;
end;
$$;

create or replace function public.admin_alerts(limit_to int default 50)
returns table (metric text, threshold int, period_key text, value numeric,
               ceiling numeric, sent_at timestamptz)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  perform admin.require_admin();
  return query
    select a.metric, a.threshold, a.period_key, a.value, a.ceiling, a.sent_at
    from admin.alert_sent a
    order by a.sent_at desc
    limit greatest(1, least(limit_to, 500));
end;
$$;

create or replace function public.admin_job_runs(limit_to int default 14)
returns table (started_at timestamptz, ok boolean, ms int, detail jsonb)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  perform admin.require_admin();
  return query
    select j.started_at, j.ok, j.ms, j.detail
    from admin.job_run j
    order by j.started_at desc
    limit greatest(1, least(limit_to, 200));
end;
$$;


-- Postgres grants EXECUTE to PUBLIC on every new function, so these revokes are
-- doing real work rather than being decorative. anon is never granted back:
-- unlike shared_session() in 0005, nothing here is for a stranger with a link.
revoke all on function public.admin_metrics(date, date)  from public;
revoke all on function public.admin_quotas()             from public;
revoke all on function public.admin_alerts(int)          from public;
revoke all on function public.admin_job_runs(int)        from public;

grant execute on function public.admin_metrics(date, date) to authenticated;
grant execute on function public.admin_quotas()            to authenticated;
grant execute on function public.admin_alerts(int)         to authenticated;
grant execute on function public.admin_job_runs(int)       to authenticated;

-- Tell PostgREST the schema moved.
notify pgrst, 'reload schema';
