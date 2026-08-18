import { describe, expect, it } from 'vitest';
import { crossed, crossings, periodKey, usedPct, type Quota } from './quota';

function quota(over: Partial<Quota> = {}): Quota {
  return {
    metric: 'resend_sends_day',
    service: 'resend',
    ceiling: 100,
    unit: 'emails',
    period: 'daily',
    available: true,
    note: null,
    value: 0,
    asOf: '2026-08-18',
    ...over,
  };
}

describe('usedPct', () => {
  it('is null when there is no reading, rather than zero', () => {
    // The distinction the whole alerting design rests on. A quota we cannot
    // read is not a quota at 0%.
    expect(usedPct(quota({ value: null }))).toBeNull();
  });

  it('is null rather than infinite when the ceiling is zero', () => {
    expect(usedPct(quota({ value: 5, ceiling: 0 }))).toBeNull();
  });

  it('is a percentage of the ceiling', () => {
    expect(usedPct(quota({ value: 55 }))).toBe(55);
    expect(usedPct(quota({ value: 250, ceiling: 500 }))).toBe(50);
  });
});

describe('crossed', () => {
  it('is empty below the first line', () => {
    expect(crossed(quota({ value: 49 }))).toEqual([]);
  });

  it('includes a threshold landed on exactly', () => {
    expect(crossed(quota({ value: 50 }))).toEqual([50]);
    expect(crossed(quota({ value: 80 }))).toEqual([80, 50]);
  });

  it('returns the highest first, so an email leads with the worse number', () => {
    expect(crossed(quota({ value: 85 }))).toEqual([80, 50]);
  });

  it('reports both lines when a reading blows straight past them', () => {
    expect(crossed(quota({ value: 400 }))).toEqual([80, 50]);
  });
});

describe('periodKey', () => {
  const when = new Date('2026-08-18T23:40:00Z');

  it('resets a daily quota overnight', () => {
    expect(periodKey('daily', when)).toBe('2026-08-18');
    expect(periodKey('daily', new Date('2026-08-19T00:10:00Z'))).toBe('2026-08-19');
  });

  it('resets a monthly quota on the first', () => {
    expect(periodKey('monthly', when)).toBe('2026-08');
    expect(periodKey('monthly', new Date('2026-09-01T00:00:00Z'))).toBe('2026-09');
  });

  it('never resets an absolute one, because the database does not shrink', () => {
    expect(periodKey('absolute', when)).toBe('once');
    expect(periodKey('absolute', new Date('2030-01-01T00:00:00Z'))).toBe('once');
  });

  it('works in UTC, so a late evening reading lands in the right month', () => {
    // 19:40 in Toronto on 31 August is already September in UTC. The database
    // stamps UTC, so the alert has to agree with it.
    expect(periodKey('monthly', new Date('2026-09-01T02:00:00Z'))).toBe('2026-09');
  });
});

describe('crossings', () => {
  const when = new Date('2026-08-18T12:00:00Z');

  it('skips a quota that no API can read', () => {
    const q = quota({ metric: 'vercel_bandwidth_bytes', available: false, value: 99 });
    expect(crossings([q], when)).toEqual([]);
  });

  it('skips a quota that has never been captured', () => {
    expect(crossings([quota({ value: null })], when)).toEqual([]);
  });

  it('carries the period key of each quota, not one shared key', () => {
    const found = crossings(
      [
        quota({ metric: 'resend_sends_day', period: 'daily', value: 90 }),
        quota({ metric: 'sentry_events_month', period: 'monthly', value: 90 }),
        quota({ metric: 'supabase_db_bytes', period: 'absolute', value: 90 }),
      ],
      when
    );
    const keys = Object.fromEntries(found.map((c) => [c.quota.metric, c.periodKey]));
    expect(keys).toEqual({
      resend_sends_day: '2026-08-18',
      sentry_events_month: '2026-08',
      supabase_db_bytes: 'once',
    });
  });

  it('emits one crossing per threshold met', () => {
    expect(crossings([quota({ value: 85 })], when)).toHaveLength(2);
    expect(crossings([quota({ value: 55 })], when)).toHaveLength(1);
    expect(crossings([quota({ value: 5 })], when)).toHaveLength(0);
  });
});
