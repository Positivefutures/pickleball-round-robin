/**
 * The retired "every N rounds" machine.
 *
 * These moved here whole when the host stopped setting frequencies and started
 * setting the rounds themselves. They are not dead weight: `runMigrations()`
 * runs `planRoundTypes` over a host's old settings to derive their first plan,
 * so every case below is now pinning what somebody gets on upgrade.
 */
import { describe, it, expect } from 'vitest';
import type { RoundType } from '../types';
import { ROUND_TYPES } from './roundTypes';
import type { SpecialGameTypes } from './legacySpecialTypes';
import {
  DEFAULT_SPECIAL_TYPES, normalizeSpecialTypes, orderedTypes, planRoundTypes,
} from './legacySpecialTypes';

function config(
  on: Partial<Record<RoundType, number>>,
  order?: RoundType[]
): SpecialGameTypes {
  const cfg = { ...DEFAULT_SPECIAL_TYPES };
  for (const [type, frequency] of Object.entries(on)) {
    cfg[type as RoundType] = { ...cfg[type as RoundType], enabled: true, frequency };
  }
  if (order) {
    for (const t of ROUND_TYPES) cfg[t] = { ...cfg[t], order: order.indexOf(t) };
  }
  return cfg;
}

/** "G M — M" — one letter per round, easier to read than an array of strings. */
function shape(cfg: SpecialGameTypes, numRounds: number): string {
  return planRoundTypes(cfg, numRounds)
    .map((t) => (t ? t[0].toUpperCase() : '—'))
    .join(' ');
}

describe('planRoundTypes', () => {
  it('leaves every round ordinary when nothing is switched on', () => {
    expect(planRoundTypes(DEFAULT_SPECIAL_TYPES, 5)).toEqual([null, null, null, null, null]);
  });

  it('starts a lone type on round N and repeats every N', () => {
    expect(shape(config({ mixed: 3 }), 8)).toBe('— — M — — M — —');
  });

  it('fills every round when the only type is set to every round', () => {
    expect(shape(config({ skill: 1 }), 4)).toBe('S S S S');
  });

  /**
   * "Every 4 rounds" means the fourth one.
   *
   * It used to mean rounds 1 and 5, so every session opened on a special game
   * whatever the setting said. Asking for a gendered round every four rounds is
   * asking for the fourth, and a session that opens on one has waited for
   * nothing.
   */
  it('waits its frequency out before the first one', () => {
    for (let frequency = 1; frequency <= 8; frequency++) {
      const plan = planRoundTypes(config({ gendered: frequency }), 16);
      expect(plan.indexOf('gendered')).toBe(frequency - 1);
    }
  });

  it('gives none at all to a session shorter than the frequency', () => {
    // The honest answer, and the cost of the rule above. Setup says so rather
    // than quietly playing one in round 1.
    expect(shape(config({ gendered: 4 }), 3)).toBe('— — —');
  });

  // Both fall due on round 4. The rarer gendered round wins it, and mixed
  // slides to round 5 and counts on from there rather than being skipped.
  it('bumps the loser of a clash to the next round', () => {
    expect(shape(config({ gendered: 4, mixed: 2 }), 8)).toBe('— M — G M — M G');
  });

  it('lets two types at the same frequency take turns rather than starving one', () => {
    expect(shape(config({ gendered: 1, mixed: 1 }), 8)).toBe('G M G M G M G M');
    expect(shape(config({ gendered: 2, mixed: 2 }), 8)).toBe('— G M G M G M G');
    expect(shape(config({ gendered: 1, mixed: 1, skill: 1 }), 6)).toBe('G M S G M S');
  });

  it('never starves an enabled type, whatever the settings and order', () => {
    const orders: RoundType[][] = [
      ['gendered', 'mixed', 'skill'],
      ['mixed', 'skill', 'gendered'],
      ['skill', 'gendered', 'mixed'],
      ['skill', 'mixed', 'gendered'],
    ];
    for (const [g, m, sk] of [[1, 1, 1], [1, 4, 2], [8, 1, 1], [2, 2, 2], [1, 2, 8]]) {
      for (const order of orders) {
        const plan = planRoundTypes(config({ gendered: g, mixed: m, skill: sk }, order), 30);
        for (const t of ROUND_TYPES) {
          expect(plan.filter((x) => x === t).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never gives one round two game types', () => {
    const plan = planRoundTypes(config({ gendered: 3, mixed: 3, skill: 3 }), 12);
    expect(plan).toHaveLength(12);
    for (const type of ROUND_TYPES) {
      expect(plan.filter((t) => t === type).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives all three a fair share when they run together', () => {
    const plan = planRoundTypes(config({ gendered: 3, mixed: 3, skill: 3 }), 9);
    const counts = ROUND_TYPES.map((t) => plan.filter((x) => x === t).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("follows the host's order when two types are set the same", () => {
    expect(shape(config({ gendered: 2, mixed: 2 }, ['mixed', 'gendered', 'skill']), 6))
      .toBe('— M G M G M');
  });

  it("leaves the rarer type first even when the host puts another above it", () => {
    // Rarity has to outrank the host's order, or a frequent type placed on top
    // would keep bumping a rare one until it never played.
    expect(shape(config({ gendered: 4, mixed: 2 }, ['mixed', 'gendered', 'skill']), 8))
      .toBe('— M — G M — M G');
  });
});

describe('normalizeSpecialTypes', () => {
  it('lets any type play every round, however many are switched on', () => {
    const cfg = normalizeSpecialTypes(config({ gendered: 1, mixed: 1, skill: 1 }));
    for (const t of ROUND_TYPES) expect(cfg[t].frequency).toBe(1);
  });

  it('caps a frequency at 8 and floors it at 1', () => {
    expect(normalizeSpecialTypes(config({ skill: 99 })).skill.frequency).toBe(8);
    expect(normalizeSpecialTypes(config({ skill: 0 })).skill.frequency).toBe(1);
  });

  it('fills in an order for a config saved before there was one', () => {
    // What v1.40.0 wrote: settings with no order at all.
    const legacy = {
      gendered: { enabled: true, frequency: 2 },
      mixed: { enabled: true, frequency: 2 },
      skill: { enabled: false, frequency: 2 },
    } as unknown as SpecialGameTypes;
    const cfg = normalizeSpecialTypes(legacy);
    expect(orderedTypes(cfg)).toEqual(['gendered', 'mixed', 'skill']);
    expect(ROUND_TYPES.map((t) => cfg[t].order).sort()).toEqual([0, 1, 2]);
  });

  it('renumbers a duplicated order into a clean 0, 1, 2', () => {
    const clashing = {
      gendered: { enabled: true, frequency: 2, order: 5 },
      mixed: { enabled: true, frequency: 2, order: 5 },
      skill: { enabled: true, frequency: 2, order: 5 },
    } as SpecialGameTypes;
    expect(ROUND_TYPES.map((t) => normalizeSpecialTypes(clashing)[t].order).sort())
      .toEqual([0, 1, 2]);
  });
});
