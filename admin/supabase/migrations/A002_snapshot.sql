-- ============================================================================
-- A002_snapshot.sql
--
-- What the daily job actually runs, and the one-off backfill that gives the
-- charts a history on the day they are first opened.
--
-- Run it once, whole, in the Supabase SQL Editor, after A001.
--
-- ## Why the aggregation is here and not in TypeScript
--
-- The job could pull rows out and count them in Node. It does not, for three
-- reasons. Counting 60,000 player rows over the wire to count them is egress
-- against a 5 GB monthly allowance, to produce a number Postgres already knows.
-- The aggregation is reviewable in the same place as the schema it reads, in a
-- file, rather than spread through a serverless function. And a definer
-- function is the only way to read auth.users at all without handing the job a
-- service_role key.
--
-- So the job's whole database interaction is `select admin.take_snapshot()`.
--
-- ## What is backfillable, and what is honestly not
--
-- Three groups, and the difference is worth being strict about, because a chart
-- that appears to have history it does not have is worse than a short chart.
--
--   * **Exact.** Anything derived from created_at and deleted_at. Accounts,
--     groups and players all carry both, and 0001's tombstone rule means a
--     deleted group is still a row. So "how many live groups existed on 3 June"
--     is answerable exactly, today, for every day since the first account.
--
--   * **A lower bound.** Sharing. shared_sessions rows are deleted on Stop
--     Sharing and expire on a timer, so counting what remains undercounts what
--     happened. Recorded anyway, and labelled.
--
--   * **Not at all.** Anything that is a current reading rather than an event:
--     database size, sign-in recency, last-synced. last_sign_in_at holds one
--     value that is overwritten, so there is no history in it to recover. These
--     start the day the job first runs, and the dashboard says so rather than
--     drawing a line from zero.
-- ============================================================================


-- ------------------------------------------------------------------ record --
-- One writer, so every metric lands the same way and a re-run corrects rather
-- than duplicates. See the primary key on metric_daily in A001.
create or replace function admin.record(
  for_day date, m text, d text, v numeric
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into admin.metric_daily (day, metric, dimension, value, captured_at)
  values (for_day, m, coalesce(d, ''), v, now())
  on conflict (day, metric, dimension)
  do update set value = excluded.value, captured_at = excluded.captured_at;
$$;


-- ------------------------------------------------------------- record_many --
-- The same, for the metrics the job gathers from Sentry and Resend, which
-- Postgres has no way to fetch for itself.
--
-- Takes one jsonb array of {metric, dimension, value} rather than a row per
-- call, because each call is an HTTPS round trip through the Management API and
-- there is no reason to make eight of them.
create or replace function admin.record_many(for_day date, rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int := 0;
  r jsonb;
begin
  for r in select * from jsonb_array_elements(rows) loop
    perform admin.record(
      for_day,
      r ->> 'metric',
      coalesce(r ->> 'dimension', ''),
      (r ->> 'value')::numeric
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;


-- ------------------------------------------------------------------- bands --
-- Group and roster sizes are asked for against the planned free tier limits, so
-- what matters is the shape of the distribution rather than any one number.
--
-- Fixed bands rather than a histogram computed from the data, so that the chart
-- means the same thing in March as it did in January. The boundaries are chosen
-- against how the app is actually used: four is one court, eight is two, and
-- past twenty a host is running something unusual.
create or replace function admin.size_band(n int)
returns text
language sql
immutable
as $$
  select case
    when n is null or n < 1 then '0'
    when n <= 4  then '1-4'
    when n <= 8  then '5-8'
    when n <= 12 then '9-12'
    when n <= 16 then '13-16'
    when n <= 20 then '17-20'
    when n <= 32 then '21-32'
    else '33+'
  end;
$$;


-- =========================================================== take_snapshot --
-- Everything the database can know about itself, for one day.
--
-- Called with no argument by the daily job, which means today. Takes a date so
-- it can be re-run for yesterday if a run was missed, and so the backfill below
-- can share the parts that are reconstructible.
--
-- Idempotent, deliberately and by construction: every write goes through
-- admin.record, which upserts. Vercel's Hobby cron fires within an hour of the
-- requested time and is not promised to fire exactly once, so this has to be
-- safe to run twice. It is also safe to run by hand while looking at it.
create or replace function admin.take_snapshot(for_day date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  written int := 0;
  rec     record;
begin
  -- ---------------------------------------------------------------- accounts
  -- Exact and backfillable. auth.users is the only place an account exists;
  -- public.profiles mirrors it through the trigger in 0001 but would miss any
  -- user created before that trigger, so the source of truth is used directly.
  perform admin.record(for_day, 'accounts_total', '',
    (select count(*) from auth.users u where u.created_at::date <= for_day));

  perform admin.record(for_day, 'accounts_new', '',
    (select count(*) from auth.users u where u.created_at::date = for_day));

  -- ------------------------------------------------------------------ groups
  -- Live on that day, not live today. The tombstone rule from 0001 is what
  -- makes this reconstructible: a deleted group keeps its row and gains a
  -- deleted_at, so a group deleted in July still counts as live in June.
  perform admin.record(for_day, 'groups_total', '',
    (select count(*) from public.rosters r
      where r.created_at::date <= for_day
        and (r.deleted_at is null or r.deleted_at::date > for_day)));

  perform admin.record(for_day, 'groups_new', '',
    (select count(*) from public.rosters r where r.created_at::date = for_day));

  -- ----------------------------------------------------------------- players
  perform admin.record(for_day, 'players_total', '',
    (select count(*) from public.players p
      where p.created_at::date <= for_day
        and (p.deleted_at is null or p.deleted_at::date > for_day)));

  perform admin.record(for_day, 'players_new', '',
    (select count(*) from public.players p where p.created_at::date = for_day));

  -- ------------------------------------------------------------------ shares
  -- A lower bound and labelled as one everywhere it is shown. Stop Sharing
  -- deletes the row (0005 explains why a tombstone would be worse), so this
  -- counts shares that were still alive when the snapshot ran.
  perform admin.record(for_day, 'shares_new', '',
    (select count(*) from public.shared_sessions s
      where s.created_at::date = for_day));

  perform admin.record(for_day, 'shares_live', '',
    (select count(*) from public.shared_sessions s where s.expires_at > now()));

  -- Only today's readings from here down. Re-running for a past day would
  -- stamp today's answer onto that day, which is exactly the lie this file is
  -- trying not to tell.
  if for_day <> current_date then
    return jsonb_build_object('day', for_day, 'mode', 'historical');
  end if;

  -- -------------------------------------------------------- database size --
  -- pg_database_size rather than any billing figure. It is exact, it is free,
  -- it does not lag, and it is the number the 500 MB ceiling is actually
  -- measured against.
  perform admin.record(for_day, 'supabase_db_bytes', '',
    pg_database_size(current_database()));

  -- App data on its own, which is the number that actually grows with use.
  -- docs/costs-and-limits.md found 10.7 MB of database holding 224 KB of
  -- pickleball, and the gap between those two is the whole reason nobody
  -- should panic at the first figure.
  perform admin.record(for_day, 'app_data_bytes', '',
    coalesce((
      select sum(pg_total_relation_size(c.oid))
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ), 0));

  -- --------------------------------------------------------- sign-in recency
  -- What Supabase counts as a monthly active user, computed the same way they
  -- describe it. No history: last_sign_in_at is overwritten each time.
  perform admin.record(for_day, 'supabase_mau', '',
    (select count(*) from auth.users u
      where u.last_sign_in_at > now() - interval '30 days'));

  perform admin.record(for_day, 'accounts_signed_in_7d', '',
    (select count(*) from auth.users u
      where u.last_sign_in_at > now() - interval '7 days'));

  -- ------------------------------------------------------------ last synced --
  -- The better of the two "is this account alive" signals, and the reason no
  -- last_seen_at column is needed on profiles: server_updated_at already exists
  -- on all three synced tables, is already maintained by the trigger in 0001,
  -- and is already indexed.
  --
  -- Its honest weakness: it only moves when data changes, so a host who runs an
  -- afternoon without editing their roster looks idle. It is a floor on
  -- activity, never a ceiling.
  perform admin.record(for_day, 'accounts_synced_7d', '',
    (select count(*) from (
      select u.id
      from auth.users u
      where greatest(
        coalesce((select max(r.server_updated_at) from public.rosters r     where r.user_id = u.id), 'epoch'::timestamptz),
        coalesce((select max(p.server_updated_at) from public.players p     where p.user_id = u.id), 'epoch'::timestamptz),
        coalesce((select max(f.server_updated_at) from public.preferences f where f.user_id = u.id), 'epoch'::timestamptz)
      ) > now() - interval '7 days'
    ) alive));

  perform admin.record(for_day, 'accounts_synced_30d', '',
    (select count(*) from (
      select u.id
      from auth.users u
      where greatest(
        coalesce((select max(r.server_updated_at) from public.rosters r     where r.user_id = u.id), 'epoch'::timestamptz),
        coalesce((select max(p.server_updated_at) from public.players p     where p.user_id = u.id), 'epoch'::timestamptz),
        coalesce((select max(f.server_updated_at) from public.preferences f where f.user_id = u.id), 'epoch'::timestamptz)
      ) > now() - interval '30 days'
    ) alive));

  -- --------------------------------------------------------- the pause clock
  -- docs/costs-and-limits.md names this as the single most likely way the app
  -- breaks: Supabase pauses a free project after roughly 7 days of too little
  -- database activity, sign-in and sync stop, and almost nobody notices because
  -- the app itself works without an account.
  --
  -- This job is itself activity, every day, so building the dashboard mostly
  -- retires the risk. The number is still worth showing, because it is the one
  -- that says whether the defence is working.
  perform admin.record(for_day, 'days_since_app_write', '',
    (select extract(epoch from (now() - greatest(
        coalesce((select max(r.server_updated_at) from public.rosters r), 'epoch'::timestamptz),
        coalesce((select max(p.server_updated_at) from public.players p), 'epoch'::timestamptz),
        coalesce((select max(f.server_updated_at) from public.preferences f), 'epoch'::timestamptz)
      ))) / 86400));

  -- ------------------------------------------------------------- group sizes
  -- Asked for against the planned free tier limits. Dimensioned by band, so one
  -- metric carries the whole distribution and the chart is a bar per band.
  --
  -- Membership is `r.id = any(p.roster_ids)`: roster_ids is a text[] on the
  -- player, not a join table. 0001 explains that choice and the cost of it, and
  -- this is one of the places the cost is paid.
  --
  -- A loop rather than an insert...select, because every write in this file
  -- goes through admin.record so that the upsert rule has exactly one
  -- implementation.
  for rec in
    select admin.size_band(cnt::int) as band, count(*)::numeric as n
    from (
      select (
        select count(*)
        from public.players p
        where p.user_id = r.user_id
          and r.id = any (p.roster_ids)
          and p.deleted_at is null
      ) as cnt
      from public.rosters r
      where r.deleted_at is null
    ) sized
    group by 1
  loop
    perform admin.record(for_day, 'group_size', rec.band, rec.n);
  end loop;

  -- Groups per account, which is the other half of the free tier question:
  -- whether a limit should be on group size, on group count, or on both.
  -- Two levels of grouping, and the inner one is easy to lose: group by user to
  -- get each account's band, then count accounts per band. Grouping once would
  -- give one row per account rather than one row per band.
  --
  -- Counted from auth.users outward rather than from rosters inward, so that an
  -- account which has never made a group lands in the '0' band instead of
  -- vanishing. That band is the closest thing to an activation rate that exists
  -- without the usage ping: people who signed up and then did nothing.
  for rec in
    select band, count(*)::numeric as n
    from (
      select admin.size_band((
        select count(*)::int from public.rosters r
        where r.user_id = u.id and r.deleted_at is null
      )) as band
      from auth.users u
    ) per_account
    group by band
  loop
    perform admin.record(for_day, 'groups_per_account', rec.band, rec.n);
  end loop;

  select count(*) into written from admin.metric_daily where day = for_day;
  return jsonb_build_object('day', for_day, 'mode', 'live', 'metrics', written);
end;
$$;


-- ================================================================ backfill --
-- Walk every day from the first account to yesterday, writing only the metrics
-- that are exactly reconstructible. Safe to run more than once.
--
-- On a database with three accounts this is instant. It is written as a loop
-- rather than a single set-based insert because take_snapshot already contains
-- the definitions, and two copies of "what groups_total means" would be one
-- copy too many. The day they disagree is the day the chart lies.
create or replace function admin.backfill()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_day date;
  d date;
  days int := 0;
begin
  select min(created_at)::date into first_day from auth.users;
  if first_day is null then
    return jsonb_build_object('backfilled', 0, 'note', 'No accounts yet.');
  end if;

  d := first_day;
  while d < current_date loop
    perform admin.take_snapshot(d);
    d := d + 1;
    days := days + 1;
  end loop;

  return jsonb_build_object('backfilled', days, 'from', first_day, 'to', current_date - 1);
end;
$$;


-- ---------------------------------------------------------------- job_run --
-- Called by the job at the end of every run, so a run that failed is visible as
-- a failure rather than as an absence.
create or replace function admin.finish_run(ok boolean, detail jsonb, ms int)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into admin.job_run (ok, detail, ms) values (ok, detail, ms);
$$;


-- --------------------------------------------------------------- claim_alert --
-- The anti-spam rule, as one call.
--
-- Returns true if this is the first time this threshold has been crossed in
-- this period, and false if you have already been told. The insert is the
-- claim: two runs racing cannot both win, because the primary key will not let
-- them.
-- `create or replace` refuses to rename an input parameter, so re-running this
-- file over an older draft of this function fails rather than updating it. The
-- drop keeps the file runnable top to bottom on any database, which is the
-- promise every migration here makes.
drop function if exists admin.claim_alert(text, int, text, numeric, numeric);

-- The arguments are named m / t / pkey / v / c rather than after their columns,
-- and that is not laziness. `period_key text` as a parameter name is ambiguous
-- against `period_key` the column inside `on conflict`, and Postgres rejects the
-- statement outright. 0005 documents the nastier version of the same trap, where
-- the ambiguity resolves silently to the column and the predicate becomes always
-- true. Here it fails loudly, which is the good case, and it was caught by
-- running it. Do not rename these to match the columns.
create or replace function admin.claim_alert(
  m text, t int, pkey text, v numeric, c numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed int;
begin
  insert into admin.alert_sent (metric, threshold, period_key, value, ceiling)
  values (m, t, pkey, v, c)
  on conflict (metric, threshold, period_key) do nothing;

  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;

notify pgrst, 'reload schema';
