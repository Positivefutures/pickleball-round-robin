/**
 * The dashboard's panels, fed by hand.
 *
 * Deliberately imports the real components rather than copying their markup,
 * for the same reason /style-guide in the main app does: a copy stops tracking
 * the original the moment either changes, which defeats the point of having it.
 */

import { Shell } from '../src/components/Dashboard';
import { LineChart } from '../src/components/LineChart';
import { BarChart } from '../src/components/BarChart';
import { QuotaRow } from '../src/components/QuotaRow';
import type { Quota } from '../src/lib/quota';
import { bytes, count } from '../src/lib/format';

const DAY = 86_400_000;

/** A series that grows in steps, the way a handful of accounts actually does. */
function stepped(days: number, steps: [number, number][]): { day: string; value: number }[] {
  const start = Date.now() - days * DAY;
  return Array.from({ length: days }, (_, i) => {
    let value = 0;
    for (const [at, v] of steps) if (i >= at) value = v;
    return { day: new Date(start + i * DAY).toISOString().slice(0, 10), value };
  });
}

function noisyRamp(days: number, from: number, per: number): { day: string; value: number }[] {
  const start = Date.now() - days * DAY;
  return Array.from({ length: days }, (_, i) => ({
    day: new Date(start + i * DAY).toISOString().slice(0, 10),
    // Deterministic wobble, so the screenshot is the same every time.
    value: Math.round(from + i * per + Math.sin(i / 3) * per * 2),
  }));
}

const accounts = stepped(90, [
  [0, 1],
  [12, 2],
  [31, 3],
  [55, 4],
  [58, 5],
  [70, 6],
  [84, 8],
  [88, 9],
]);

const active = stepped(90, [
  [0, 1],
  [12, 2],
  [31, 3],
  [55, 3],
  [70, 4],
  [84, 6],
  [88, 6],
]);

const dbBytes = noisyRamp(90, 10_800_000, 21_000);

function quota(over: Partial<Quota>): Quota {
  return {
    metric: 'x',
    service: 'supabase',
    ceiling: 100,
    unit: 'emails',
    period: 'monthly',
    available: true,
    note: null,
    value: 0,
    asOf: '2026-08-18',
    ...over,
  };
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

export function Preview() {
  return (
    // The real Shell, not a copy of it. This page had its own hand-written
    // header until 2026-08-23, which is exactly the drift this file's own
    // docstring warns about: it still said the old product name a rename later,
    // and nobody looking at it would have known.
    <Shell email="jeff@positivefutures.com" onSignOut={() => {}}>
        <Panel title="Working?" note="The three things that would make everything below untrue.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Tile label="Last snapshot" value="6 hours ago" />
            <Tile label="Database" value="Writable" />
            <Tile
              label="Since the last app write"
              value="0.4 days"
              note="Supabase pauses a free project near 7."
            />
          </div>
          <p className="mt-3 mb-0 text-sm text-[var(--color-good)]">
            All three fine as of the last run.
          </p>
        </Panel>

        <Panel
          title="Accounts"
          note="Everyone here signed up. Most people who use the app never do, and none of them appear on this page at all."
        >
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Accounts" value="9" />
            <Tile label="New this month" value="4" />
            <Tile label="Used in 30 days" value="6" note="Synced, not merely signed in" />
            <Tile label="Of those, active" value="67%" />
          </div>
          <LineChart
            series={[
              { label: 'Accounts', points: accounts, slot: 1 },
              { label: 'Used in 30 days', points: active, slot: 3 },
            ]}
            format={count}
          />
        </Panel>

        <Panel title="Groups and players" note="Backfilled from the day the first account was made.">
          <LineChart
            series={[
              { label: 'Groups', points: stepped(90, [[0, 3], [20, 5], [44, 8], [62, 11], [80, 16], [88, 19]]), slot: 1 },
              { label: 'Players', points: stepped(90, [[0, 21], [20, 38], [44, 61], [62, 88], [80, 131], [88, 154]]), slot: 2 },
            ]}
            format={count}
          />
        </Panel>

        <Panel
          title="Room left"
          note="Two of these cannot be read on the free plan. They say so rather than showing an empty bar."
        >
          <ul className="m-0 list-none p-0">
            <QuotaRow
              quota={quota({
                metric: 'supabase_db_bytes',
                ceiling: 524_288_000,
                unit: 'bytes',
                period: 'absolute',
                value: dbBytes[dbBytes.length - 1].value,
                note: 'Exceeding it puts the project into read-only mode after a grace period.',
              })}
              history={dbBytes}
            />
            <QuotaRow
              quota={quota({
                metric: 'resend_sends_day',
                service: 'resend',
                ceiling: 100,
                period: 'daily',
                value: 58,
                note: 'Shared with sign-in codes.',
              })}
              history={noisyRamp(30, 20, 1.4)}
            />
            <QuotaRow
              quota={quota({
                metric: 'sentry_events_month',
                service: 'sentry',
                ceiling: 5000,
                unit: 'events',
                value: 4310,
              })}
              history={noisyRamp(30, 900, 118)}
            />
            <QuotaRow
              quota={quota({
                metric: 'supabase_mau',
                ceiling: 50_000,
                unit: 'people',
                value: 6,
              })}
              history={stepped(40, [[0, 3], [20, 5], [33, 6]])}
            />
            <QuotaRow
              quota={quota({
                metric: 'vercel_bandwidth_bytes',
                service: 'vercel',
                ceiling: 107_374_182_400,
                unit: 'bytes',
                available: false,
                value: null,
                note: 'The Web Analytics and usage APIs are not available on Hobby.',
              })}
              history={[]}
            />
          </ul>
        </Panel>

        <Panel
          title="Shape of use"
          note="What a free tier limit would actually bite. Today's picture, not a trend."
        >
          <h3 className="mt-0 mb-1.5 text-sm font-semibold">Players per group</h3>
          <BarChart
            bars={[
              { label: '0', value: 2 },
              { label: '1-4', value: 1 },
              { label: '5-8', value: 4 },
              { label: '9-12', value: 7 },
              { label: '13-16', value: 3 },
              { label: '17-20', value: 2 },
            ]}
            unit="groups"
          />
          <h3 className="mt-4 mb-1.5 text-sm font-semibold">Groups per account</h3>
          <p className="mt-0 mb-1.5 text-sm text-[var(--color-ink-quiet)]">
            The 0 band is people who signed up and never made a group.
          </p>
          <BarChart
            bars={[
              { label: '0', value: 3 },
              { label: '1-4', value: 5 },
              { label: '5-8', value: 1 },
            ]}
            unit="accounts"
          />
        </Panel>

        <Panel title="Crashes" note="Open issues in Sentry, and how much is getting through.">
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Tile label="Open issues" value="3" />
            <Tile label="Events, 14 days" value="41" />
            <Tile label="Dropped this month" value="0" />
          </div>
          <LineChart
            series={[{ label: 'Crashes this month', points: noisyRamp(30, 900, 118), slot: 2 }]}
            format={count}
          />
          <p className="mt-3 mb-0 text-sm text-[var(--color-ink-quiet)]">
            Database is {bytes(dbBytes[dbBytes.length - 1].value)}, of which {bytes(238_000)} is app
            data. The rest is Postgres's own furniture and does not grow with use.
          </p>
        </Panel>
    </Shell>
  );
}
