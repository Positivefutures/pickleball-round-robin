import { describe, it, expect } from 'vitest';
import { EXAMPLE_ROSTER, buildExamplePlayers } from './exampleGroup';
import { MIN_RATING, MAX_RATING } from './rating';

describe('the example roster', () => {
  it('is 24 people, half men and half women', () => {
    expect(EXAMPLE_ROSTER).toHaveLength(24);
    expect(EXAMPLE_ROSTER.filter((p) => p.gender === 'M')).toHaveLength(12);
    expect(EXAMPLE_ROSTER.filter((p) => p.gender === 'F')).toHaveLength(12);
  });

  it('uses names a host would type: first name, last initial, no repeats', () => {
    for (const p of EXAMPLE_ROSTER) expect(p.name).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/);
    expect(new Set(EXAMPLE_ROSTER.map((p) => p.name)).size).toBe(24);
  });

  it('keeps every rating inside the app bounds, on the stepper grid', () => {
    for (const p of EXAMPLE_ROSTER) {
      expect(p.rating).toBeGreaterThanOrEqual(MIN_RATING);
      expect(p.rating).toBeLessThanOrEqual(MAX_RATING);
      // The rating control moves by 0.1 and shows one decimal, so a sample
      // player must sit on a value it can reach and display unchanged.
      expect(Math.round(p.rating * 10) / 10).toBe(p.rating);
    }
  });
});

describe('buildExamplePlayers', () => {
  it('mints fresh ids from the caller and homes everyone in the one roster', () => {
    let n = 0;
    const built = buildExamplePlayers('r1', () => `id${n++}`);
    expect(built).toHaveLength(24);
    expect(new Set(built.map((p) => p.id)).size).toBe(24);
    expect(built.every((p) => p.rosterIds.length === 1 && p.rosterIds[0] === 'r1')).toBe(true);
    // Sample players are ordinary players: nothing marks them as guests.
    expect(built.every((p) => !('guest' in p))).toBe(true);
  });
});
