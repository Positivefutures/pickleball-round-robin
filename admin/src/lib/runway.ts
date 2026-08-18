/**
 * When does this line hit that ceiling.
 *
 * The brief asked for something more useful than a threshold: "at the current
 * rate you cross the Supabase 500 MB limit in roughly six weeks."
 *
 * The whole difficulty is that a confidently wrong date is worse than no date.
 * With the numbers this app has today, almost every quota will legitimately
 * have no trend at all, and the honest output for most of them, for a long
 * time, is "no trend". Everything below exists to make that the easy answer to
 * give and a real date the hard one.
 *
 * Four refusals, in the order they are checked:
 *
 *   1. Too few readings. A line through three points is not a trend.
 *   2. Already over. There is nothing to project; say so.
 *   3. Flat or falling. A negative slope has no crossing in the future, and
 *      floating point being what it is, "almost flat" produces a date in the
 *      year 3000 rather than an error.
 *   4. A poor fit. R squared below the floor means the points are a cloud, and
 *      a line through a cloud is a line through anything you like.
 *
 * Pure, so every one of those is provable without a database. See runway.test.ts.
 */

export interface Reading {
  /** ISO date, YYYY-MM-DD. */
  day: string;
  value: number;
}

export type Runway =
  | { kind: 'over'; value: number }
  | { kind: 'none'; reason: string }
  | {
      kind: 'date';
      /** ISO date the fitted line meets the ceiling. */
      day: string;
      days: number;
      /** How much to trust it. Rendered as different wording, not a number. */
      confidence: 'firm' | 'rough';
      /** Units per day, for "growing at 1.2 MB a day". */
      slope: number;
    };

/** Below this many readings there is nothing worth fitting. */
export const MIN_READINGS = 7;

/** Below this fit, the points are a cloud rather than a line. */
export const MIN_FIT = 0.5;

/** A crossing further out than this is indistinguishable from never. */
export const HORIZON_DAYS = 3650;

const DAY_MS = 86_400_000;

function toDayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

function toIso(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Ordinary least squares, plus the coefficient of determination.
 *
 * Written out rather than pulled from a library because it is nine lines and
 * this app has no maths dependency, and because the guards above need R
 * squared, which most one-line regression helpers do not return.
 */
function fit(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const n = xs.length;
  const meanX = xs.reduce((t, x) => t + x, 0) / n;
  const meanY = ys.reduce((t, y) => t + y, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
  }

  // Every reading on the same day, which the caller should have prevented.
  if (sxx === 0) return { a: meanY, b: 0, r2: 0 };

  const b = sxy / sxx;
  const a = meanY - b * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - (a + b * xs[i])) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }

  // A perfectly flat series has no variance to explain, so R squared is 0/0.
  //
  // Defensive rather than load-bearing, and worth saying so: a flat series also
  // has a zero slope, and project() refuses on the slope before it ever looks
  // at the fit. Sabotaging this line to return 1 does not turn the suite red,
  // which is how that was established. It stays because a NaN leaking out of
  // here would pass `r2 < MIN_FIT` silently, and this is cheaper than relying
  // on the ordering of two guards in another function staying as it is.
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { a, b, r2 };
}

/**
 * Project a series to a ceiling.
 *
 * `window` is how many trailing readings to fit. Four weeks by default: long
 * enough to see through a quiet fortnight, short enough that a change in
 * direction shows up within a month rather than being averaged away by a year
 * of history.
 */
export function project(
  readings: Reading[],
  ceiling: number,
  window = 28
): Runway {
  const sorted = [...readings]
    .filter((r) => Number.isFinite(r.value))
    .sort((p, q) => p.day.localeCompare(q.day));

  // Deduplicate by day, keeping the last. A day snapshotted twice is one
  // reading, not two, and leaving both would weight that day double.
  const byDay = new Map<string, number>();
  for (const r of sorted) byDay.set(r.day, r.value);

  const recent = [...byDay.entries()].slice(-window);

  if (recent.length < MIN_READINGS) {
    return {
      kind: 'none',
      reason: `Not enough history yet. ${recent.length} of ${MIN_READINGS} days.`,
    };
  }

  const latest = recent[recent.length - 1][1];
  if (latest >= ceiling) return { kind: 'over', value: latest };

  const xs = recent.map(([day]) => toDayNumber(day));
  const ys = recent.map(([, value]) => value);
  const { a, b, r2 } = fit(xs, ys);

  if (b <= 0) return { kind: 'none', reason: 'Flat or falling.' };
  if (r2 < MIN_FIT) return { kind: 'none', reason: 'Too up and down to project.' };

  const lastX = xs[xs.length - 1];
  // From the fitted line rather than from the last raw reading, so that one
  // unusual final day does not move the answer by weeks.
  const days = Math.ceil((ceiling - (a + b * lastX)) / b);

  if (days <= 0) return { kind: 'over', value: latest };
  if (days > HORIZON_DAYS) return { kind: 'none', reason: 'Further out than ten years.' };

  return {
    kind: 'date',
    day: toIso(lastX + days),
    days,
    confidence: r2 >= 0.8 && recent.length >= 14 ? 'firm' : 'rough',
    slope: b,
  };
}

/**
 * The sentence the dashboard actually shows.
 *
 * Kept next to the maths so that the hedging in the wording and the hedging in
 * the guards cannot drift apart. "Roughly" and "around" are doing real work:
 * neither number deserves a definite article.
 */
export function describe(runway: Runway, unit: string): string {
  switch (runway.kind) {
    case 'over':
      return 'Already over the limit.';
    case 'none':
      return runway.reason;
    case 'date': {
      const when =
        runway.days < 14
          ? `${runway.days} days`
          : runway.days < 90
            ? `${Math.round(runway.days / 7)} weeks`
            : `${Math.round(runway.days / 30)} months`;
      const hedge = runway.confidence === 'firm' ? 'in about' : 'in roughly';
      return `At this rate, ${hedge} ${when} (${runway.day}). Growing ${fmt(runway.slope)} ${unit} a day.`;
    }
  }
}

function fmt(n: number): string {
  if (n >= 100) return Math.round(n).toLocaleString();
  if (n >= 1) return n.toFixed(1);
  return n.toFixed(3);
}
