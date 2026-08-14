import { describe, it, expect } from 'vitest';
import { EXAMPLE_ROSTER, buildExamplePlayers } from './exampleGroup';
import { DEFAULT_COURTS, SEATS_PER_COURT } from './assign';
import { MIN_RATING, MAX_RATING } from './rating';

describe('the example roster', () => {
  it('is 14 people, half men and half women', () => {
    expect(EXAMPLE_ROSTER).toHaveLength(14);
    expect(EXAMPLE_ROSTER.filter((p) => p.gender === 'M')).toHaveLength(7);
    expect(EXAMPLE_ROSTER.filter((p) => p.gender === 'F')).toHaveLength(7);
  });

  it('is more people than the default courts can seat, so somebody sits out', () => {
    // The first-run tour says Select All, and the first schedule a new host
    // ever sees should show a sit-out list. Three courts is what a fresh
    // install opens on, and three courts seat twelve.
    const seats = DEFAULT_COURTS * SEATS_PER_COURT;
    expect(EXAMPLE_ROSTER.length).toBeGreaterThan(seats);
    // But not so many that the rounds are mostly bench: two out of fourteen.
    expect(EXAMPLE_ROSTER.length - seats).toBe(2);
  });

  it('uses names a host would type: first name, last initial, no repeats', () => {
    for (const p of EXAMPLE_ROSTER) expect(p.name).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/);
    expect(new Set(EXAMPLE_ROSTER.map((p) => p.name)).size).toBe(14);
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
    expect(built).toHaveLength(14);
    expect(new Set(built.map((p) => p.id)).size).toBe(14);
    expect(built.every((p) => p.rosterIds.length === 1 && p.rosterIds[0] === 'r1')).toBe(true);
    // Sample players are ordinary players: nothing marks them as guests.
    expect(built.every((p) => !('guest' in p))).toBe(true);
  });
});
