/**
 * Which quota lines have been crossed, and what period a crossing belongs to.
 *
 * The brief: email at 50% and again at 80% of any quota, one alert per
 * threshold crossing rather than one per check.
 *
 * The "rather than one per check" is the whole problem, and the answer is split
 * across two places on purpose. Here is what a crossing *is*. The database
 * decides whether it has already been reported, because a primary key is the
 * only thing that gets that right when two runs overlap or a day is missed. See
 * admin.claim_alert in A002_snapshot.sql.
 *
 * The design deliberately does not compare today's reading against yesterday's.
 * That sounds like the natural way to detect a crossing and it is wrong twice
 * over: a missed snapshot means the crossing is never seen at all, and a metric
 * that wobbles either side of a line reports it repeatedly.
 *
 * Pure, and tested in quota.test.ts.
 */

export const THRESHOLDS = [50, 80] as const;
export type Threshold = (typeof THRESHOLDS)[number];

export type Period = 'daily' | 'monthly' | 'absolute';

export interface Quota {
  metric: string;
  service: string;
  ceiling: number;
  unit: string;
  period: Period;
  /** False for the ones no API on the free plan will tell us. */
  available: boolean;
  note: string | null;
  /** The most recent reading, or null if the metric has never been captured. */
  value: number | null;
  asOf: string | null;
}

/** Percentage of the ceiling, or null when there is nothing to compare. */
export function usedPct(q: Pick<Quota, 'value' | 'ceiling'>): number | null {
  if (q.value === null || !Number.isFinite(q.value)) return null;
  if (!q.ceiling) return null;
  // Multiply before dividing. (55 / 100) * 100 is 55.00000000000001 in
  // binary floating point, which is harmless against a threshold but reads as a
  // bug on the page and made a test lie about what this function returns.
  return (q.value * 100) / q.ceiling;
}

/**
 * Which thresholds this reading is at or past, highest first.
 *
 * Highest first matters: at 85% both lines are met, and the email should lead
 * with 80. The caller still claims both, so that dropping from 85 to 60 and
 * climbing back does not re-send the 50.
 */
export function crossed(q: Pick<Quota, 'value' | 'ceiling'>): Threshold[] {
  const pct = usedPct(q);
  if (pct === null) return [];
  return THRESHOLDS.filter((t) => pct >= t).sort((a, b) => b - a);
}

/**
 * The key that decides when an alert may fire again.
 *
 * A monthly allowance refills on the first, so August's warning should not
 * repeat in August and should be free to fire again in September. A daily one
 * resets overnight. An absolute ceiling, such as database size, never refills,
 * so it gets told once ever and then stays quiet.
 *
 * UTC throughout, because the snapshot runs on Vercel and the database stamps
 * in UTC, and a local timezone here would put a crossing in the wrong month
 * twice a year.
 */
export function periodKey(period: Period, when: Date): string {
  const iso = when.toISOString();
  switch (period) {
    case 'daily':
      return iso.slice(0, 10);
    case 'monthly':
      return iso.slice(0, 7);
    case 'absolute':
      return 'once';
  }
}

/** Everything an alert email needs, worked out in one place. */
export interface Crossing {
  quota: Quota;
  threshold: Threshold;
  periodKey: string;
  pct: number;
}

/**
 * Every crossing in this set of readings.
 *
 * Quotas we cannot read are skipped rather than treated as zero. A metric with
 * no value is not a metric at 0%, and alerting "you are at 0% of your Vercel
 * bandwidth" would be a lie told confidently.
 */
export function crossings(quotas: Quota[], when: Date): Crossing[] {
  const out: Crossing[] = [];
  for (const quota of quotas) {
    if (!quota.available || quota.value === null) continue;
    const pct = usedPct(quota);
    if (pct === null) continue;
    for (const threshold of crossed(quota)) {
      out.push({ quota, threshold, periodKey: periodKey(quota.period, when), pct });
    }
  }
  return out;
}
