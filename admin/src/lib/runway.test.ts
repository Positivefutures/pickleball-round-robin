import { describe, expect, it } from 'vitest';
import { project, describe as say, MIN_READINGS, type Reading } from './runway';

/** A straight line of `days` readings starting at `from`, rising by `per` a day. */
function ramp(days: number, from: number, per: number, start = '2026-01-01'): Reading[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => ({
    day: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    value: from + i * per,
  }));
}

describe('project', () => {
  it('refuses a series shorter than the minimum', () => {
    const r = project(ramp(MIN_READINGS - 1, 0, 10), 1000);
    expect(r.kind).toBe('none');
    expect(r).toMatchObject({ reason: expect.stringContaining('Not enough history') });
  });

  it('finds the crossing of a clean line', () => {
    // 100 units a day from 0, ceiling 3000. Day 29 is at 2900, so one more day.
    const r = project(ramp(30, 0, 100), 3000);
    expect(r.kind).toBe('date');
    if (r.kind !== 'date') return;
    expect(r.days).toBe(1);
    expect(r.slope).toBeCloseTo(100, 6);
    expect(r.confidence).toBe('firm');
  });

  it('says nothing rather than a date when the line is flat', () => {
    const r = project(ramp(30, 500, 0), 1000);
    expect(r).toMatchObject({ kind: 'none', reason: 'Flat or falling.' });
  });

  it('says nothing when the line is falling', () => {
    const r = project(ramp(30, 900, -5), 1000);
    expect(r).toMatchObject({ kind: 'none', reason: 'Flat or falling.' });
  });

  it('says nothing when the points are a cloud', () => {
    // Deterministic zig-zag with no trend to speak of.
    const noisy = ramp(30, 500, 0).map((r, i) => ({
      ...r,
      value: r.value + (i % 2 ? 400 : -400) + (i % 3) * 90,
    }));
    const r = project(noisy, 5000);
    expect(r).toMatchObject({ kind: 'none', reason: 'Too up and down to project.' });
  });

  it('reports being over the ceiling rather than projecting backwards', () => {
    const r = project(ramp(30, 0, 100), 500);
    expect(r).toMatchObject({ kind: 'over' });
  });

  it('treats a crossing past the horizon as no trend', () => {
    // A hair of growth against an enormous ceiling.
    const r = project(ramp(30, 0, 0.0001), 1_000_000);
    expect(r).toMatchObject({ kind: 'none', reason: 'Further out than ten years.' });
  });

  it('only fits the trailing window, so an old trend cannot outvote a new one', () => {
    // Steep for a year, then flat for a month. The flat month is what counts.
    const old = ramp(365, 0, 10);
    const last = old[old.length - 1];
    const recent = ramp(28, last.value, 0, addDays(last.day, 1));
    expect(project([...old, ...recent], 10_000, 28).kind).toBe('none');
    // And the whole history, fitted whole, does find a date. Same data and the
    // same ceiling, so the window is doing the work rather than the data being
    // degenerate or the horizon guard firing.
    expect(project([...old, ...recent], 10_000, 999).kind).toBe('date');
  });

  it('counts a day snapshotted twice as one reading', () => {
    const once = ramp(20, 0, 50);
    const twice = [...once, { day: once[3].day, value: once[3].value }];
    expect(project(twice, 5000)).toEqual(project(once, 5000));
  });

  it('is not confident about a short or scruffy series', () => {
    const wobbly = ramp(10, 0, 100).map((r, i) => ({
      ...r,
      value: r.value + (i % 2 ? 120 : -120),
    }));
    const r = project(wobbly, 5000);
    expect(r.kind).toBe('date');
    if (r.kind === 'date') expect(r.confidence).toBe('rough');
  });

  it('ignores readings that are not numbers', () => {
    const withJunk = [
      ...ramp(20, 0, 50),
      { day: '2026-03-01', value: Number.NaN },
    ];
    expect(project(withJunk, 5000).kind).toBe('date');
  });
});

describe('describe', () => {
  it('gives days, weeks or months depending on how far out it is', () => {
    expect(say(project(ramp(30, 0, 100), 3000), 'MB')).toContain('1 days');
    expect(say(project(ramp(30, 0, 10), 1000), 'MB')).toContain('weeks');
    expect(say(project(ramp(30, 0, 1), 1000), 'MB')).toContain('months');
  });

  it('passes the refusal through as the sentence, so wording cannot drift', () => {
    expect(say({ kind: 'none', reason: 'Flat or falling.' }, 'MB')).toBe('Flat or falling.');
  });

  it('says so plainly when already over', () => {
    expect(say({ kind: 'over', value: 9 }, 'MB')).toBe('Already over the limit.');
  });
});

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
