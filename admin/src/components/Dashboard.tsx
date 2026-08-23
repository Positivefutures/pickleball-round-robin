/**
 * The page.
 *
 * Ordered by what would ruin your day, not by what is most interesting:
 *
 *   1. **Is anything broken.** The job running, the project not read-only, the
 *      pause clock. If one of these is wrong, nothing below it is trustworthy.
 *   2. **Growth**, which is the question the whole thing was built to answer,
 *      with the honest caveat about who is being counted attached to it rather
 *      than hidden in a footnote.
 *   3. **Quotas and runway.**
 *   4. **Shape of use**, meaning the size distributions the free tier limits
 *      will eventually be set against.
 *   5. **Errors.**
 *
 * "Prioritise clarity over density" was the brief, so there are five sections
 * and no tabs. Everything is on one page and the page is meant to be scrolled.
 */

import { useEffect, useMemo, useState } from 'react';
import { ADMIN_NAME, LOGO_SRC } from '../lib/appInfo';
import {
  distribution,
  fetchAlerts,
  fetchJobRuns,
  fetchMetrics,
  fetchQuotas,
  latest,
  series,
  NotPermitted,
  type AlertRow,
  type JobRun,
  type MetricPoint,
  type QuotaRow as QuotaData,
} from '../lib/api';
import type { Quota } from '../lib/quota';
import { LineChart } from './LineChart';
import { BarChart } from './BarChart';
import { QuotaRow } from './QuotaRow';
import { ago, bytes, count } from '../lib/format';

const RANGE_DAYS = 90;

export function Dashboard({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [points, setPoints] = useState<MetricPoint[] | null>(null);
  const [quotas, setQuotas] = useState<QuotaData[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const until = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - RANGE_DAYS * 86_400_000).toISOString().slice(0, 10);

    Promise.all([fetchMetrics(since, until), fetchQuotas(), fetchJobRuns(), fetchAlerts()])
      .then(([m, q, r, a]) => {
        setPoints(m);
        setQuotas(q);
        setRuns(r);
        setAlerts(a);
      })
      .catch((e: unknown) => {
        setProblem(
          e instanceof NotPermitted
            ? `${email} is not on the allowlist, so there is nothing to show. That is the database refusing, not this page.`
            : (e as Error).message
        );
      });
  }, [email]);

  if (problem) {
    return (
      <Shell email={email} onSignOut={onSignOut}>
        <p role="alert" className="rounded-md bg-white p-4 text-[var(--color-critical)] shadow-sm">
          {problem}
        </p>
      </Shell>
    );
  }

  if (!points) {
    return (
      <Shell email={email} onSignOut={onSignOut}>
        <p className="text-[var(--color-ink-quiet)]">Reading…</p>
      </Shell>
    );
  }

  return (
    <Shell email={email} onSignOut={onSignOut}>
      <Health points={points} runs={runs} />
      <Growth points={points} />
      <Quotas points={points} quotas={quotas} alerts={alerts} />
      <Shape points={points} />
      <Errors points={points} />
    </Shell>
  );
}

// ------------------------------------------------------------------- shell --

export function Shell({
  email,
  onSignOut,
  children,
}: {
  email: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="bg-[var(--color-brand-teal)] px-4 py-3 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            {/* No background behind it. `logo.png` is the robin on an opaque
                white disc inside its ring, with only the square's corners
                transparent, so it carries its own ground and reads on the teal
                unaided. Checked by rendering it over magenta rather than
                assumed - the first draft of this line added a white disc the
                image already had. */}
            <img src={LOGO_SRC} alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
            <h1 className="m-0 truncate text-base font-semibold">{ADMIN_NAME}</h1>
          </span>
          <span className="flex items-center gap-3 text-sm">
            <span className="hidden opacity-90 sm:inline">{email}</span>
            <button
              onClick={onSignOut}
              className="rounded-md border-2 border-white/80 px-2.5 py-1 hover:bg-white/10 focus:outline-2 focus:outline-offset-2 focus:outline-white"
            >
              Sign out
            </button>
          </span>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--color-panel-edge)] bg-white px-4 pt-4 pb-5 shadow-sm">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      {note && <p className="mt-0.5 mb-3 text-sm text-[var(--color-ink-quiet)]">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col rounded-md bg-[#f8f9fb] px-3 py-2.5">
      <span className="text-2xl font-semibold tnum">{value}</span>
      <span className="text-sm text-[var(--color-ink-quiet)]">{label}</span>
      {note && <span className="mt-0.5 text-xs text-[var(--color-ink-faint)]">{note}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ health --

function Health({ points, runs }: { points: MetricPoint[]; runs: JobRun[] }) {
  const last = runs[0];
  const readonly = latest(points, 'supabase_readonly');
  const quiet = latest(points, 'days_since_app_write');
  const notes = last?.detail?.notes ?? [];

  const bad =
    !last ||
    last.ok === false ||
    readonly === 1 ||
    Date.now() - Date.parse(last.started_at) > 2 * 86_400_000;

  return (
    <Panel
      title="Working?"
      note="The three things that would make everything below untrue."
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Tile
          label="Last snapshot"
          value={last ? ago(last.started_at) : 'never'}
          note={last?.ok === false ? 'It failed.' : undefined}
        />
        <Tile
          label="Database"
          value={readonly === 1 ? 'Read only' : readonly === 0 ? 'Writable' : 'unknown'}
          note={readonly === 1 ? 'Over 500 MB. Sync is broken.' : undefined}
        />
        <Tile
          label="Since the last app write"
          value={quiet === null ? 'unknown' : `${quiet.toFixed(1)} days`}
          note="Supabase pauses a free project near 7."
        />
      </div>

      {notes.length > 0 && (
        <ul className="mt-3 mb-0 list-none space-y-1 p-0 text-sm text-[var(--color-ink-quiet)]">
          {notes.map((n, i) => (
            <li key={i}>
              <span className="font-medium text-[var(--color-serious)]">{n.step}</span> · {n.problem}
            </li>
          ))}
        </ul>
      )}

      {!bad && notes.length === 0 && (
        <p className="mt-3 mb-0 text-sm text-[var(--color-good)]">
          All three fine as of the last run.
        </p>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ growth --

function Growth({ points }: { points: MetricPoint[] }) {
  const accounts = series(points, 'accounts_total');
  const groups = series(points, 'groups_total');
  const players = series(points, 'players_total');

  const newThisMonth = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    return series(points, 'accounts_new')
      .filter((p) => p.day.startsWith(month))
      .reduce((t, p) => t + p.value, 0);
  }, [points]);

  const synced30 = latest(points, 'accounts_synced_30d');
  const total = latest(points, 'accounts_total');

  return (
    <>
      <Panel
        title="Accounts"
        note="Everyone here signed up. Most people who use the app never do, and none of them appear on this page at all."
      >
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Accounts" value={total === null ? '—' : count(total)} />
          <Tile label="New this month" value={count(newThisMonth)} />
          <Tile
            label="Used in 30 days"
            value={synced30 === null ? '—' : count(synced30)}
            note="Synced, not merely signed in"
          />
          <Tile
            label="Of those, active"
            value={total && synced30 !== null ? `${Math.round((synced30 / total) * 100)}%` : '—'}
          />
        </div>
        <LineChart
          series={[
            { label: 'Accounts', points: accounts, slot: 1 },
            { label: 'Used in 30 days', points: series(points, 'accounts_synced_30d'), slot: 3 },
          ]}
          format={count}
          empty="Nothing captured yet. The first snapshot backfills this."
        />
      </Panel>

      <Panel title="Groups and players" note="Backfilled from the day the first account was made.">
        <LineChart
          series={[
            { label: 'Groups', points: groups, slot: 1 },
            { label: 'Players', points: players, slot: 2 },
          ]}
          format={count}
        />
      </Panel>
    </>
  );
}

// ------------------------------------------------------------------ quotas --

function Quotas({
  points,
  quotas,
  alerts,
}: {
  points: MetricPoint[];
  quotas: QuotaData[];
  alerts: AlertRow[];
}) {
  const asQuota = (q: QuotaData): Quota => ({
    metric: q.metric,
    service: q.service,
    ceiling: q.ceiling,
    unit: q.unit,
    period: q.period,
    available: q.available,
    note: q.note,
    value: q.value,
    asOf: q.as_of,
  });

  return (
    <Panel
      title="Room left"
      note="Two of these cannot be read on the free plan. They say so rather than showing an empty bar."
    >
      <ul className="m-0 list-none p-0">
        {quotas.map((q) => (
          <QuotaRow
            key={q.metric}
            quota={asQuota(q)}
            history={series(points, q.metric).map((p) => ({ day: p.day, value: p.value }))}
          />
        ))}
      </ul>

      {alerts.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-sm font-semibold">Alerts sent</h3>
          <ul className="m-0 list-none p-0 text-sm text-[var(--color-ink-quiet)]">
            {alerts.slice(0, 6).map((a) => (
              <li key={`${a.metric}-${a.threshold}-${a.period_key}`} className="tnum">
                {a.sent_at.slice(0, 10)} · {a.metric} passed {a.threshold}%
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------- shape --

function Shape({ points }: { points: MetricPoint[] }) {
  return (
    <Panel
      title="Shape of use"
      note="What a free tier limit would actually bite. Today's picture, not a trend."
    >
      <h3 className="mt-0 mb-1.5 text-sm font-semibold">Players per group</h3>
      <BarChart bars={distribution(points, 'group_size').map((b) => ({ label: b.band, value: b.value }))} unit="groups" />

      <h3 className="mt-4 mb-1.5 text-sm font-semibold">Groups per account</h3>
      <p className="mt-0 mb-1.5 text-sm text-[var(--color-ink-quiet)]">
        The 0 band is people who signed up and never made a group.
      </p>
      <BarChart
        bars={distribution(points, 'groups_per_account').map((b) => ({ label: b.band, value: b.value }))}
        unit="accounts"
      />
    </Panel>
  );
}

// ------------------------------------------------------------------ errors --

function Errors({ points }: { points: MetricPoint[] }) {
  const open = latest(points, 'sentry_open_issues');
  const events = latest(points, 'sentry_open_events_14d');
  const dropped = latest(points, 'sentry_dropped_month');

  return (
    <Panel title="Crashes" note="Open issues in Sentry, and how much is getting through.">
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Tile label="Open issues" value={open === null ? '—' : count(open)} />
        <Tile label="Events, 14 days" value={events === null ? '—' : count(events)} />
        <Tile
          label="Dropped this month"
          value={dropped === null ? '—' : count(dropped)}
          note={dropped ? 'Over the free ceiling.' : undefined}
        />
      </div>
      <LineChart
        series={[{ label: 'Crashes this month', points: series(points, 'sentry_events_month'), slot: 2 }]}
        format={count}
        empty="Nothing from Sentry yet. Check SENTRY_AUTH_TOKEN."
      />
      <p className="mt-3 mb-0 text-sm text-[var(--color-ink-quiet)]">
        Database is {bytes(latest(points, 'supabase_db_bytes') ?? 0)}, of which{' '}
        {bytes(latest(points, 'app_data_bytes') ?? 0)} is app data. The rest is Postgres's own
        furniture and does not grow with use.
      </p>
    </Panel>
  );
}
