import { describe, it, expect } from 'vitest';
import type { CourtAssignment, Gender, Player, RoundType, SpecialGameTypes } from '../types';
import {
  DEFAULT_SPECIAL_TYPES, ROUND_TYPES, courtMatchesType, moveType, normalizeSpecialTypes,
  orderedTypes, planRoundTypes, roundTypeOf, specialSummary,
} from './roundTypes';

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

  it('starts a lone type on round 1 and repeats every N', () => {
    expect(shape(config({ mixed: 3 }), 8)).toBe('M — — M — — M —');
  });

  it('fills every round when the only type is set to every round', () => {
    expect(shape(config({ skill: 1 }), 4)).toBe('S S S S');
  });

  // Round 1 was unreachable before: with two types on, the shortest gap either
  // could have was 2, and the first round of a type was not due until round N.
  it('always opens the session on a game type', () => {
    for (let frequency = 1; frequency <= 8; frequency++) {
      expect(shape(config({ gendered: frequency, mixed: frequency }), 8)[0]).not.toBe('—');
      expect(shape(config({ gendered: frequency }), 8)[0]).toBe('G');
    }
  });

  it('still fits a type into a session shorter than its frequency', () => {
    expect(shape(config({ gendered: 4 }), 3)).toBe('G — —');
  });

  // On the clash at round 2 the rarer gendered round wins, and mixed slides to
  // the next round and counts on from there rather than being skipped.
  it('bumps the loser of a clash to the next round', () => {
    expect(shape(config({ gendered: 4, mixed: 2 }), 8)).toBe('G M — M G M — M');
  });

  it('lets two types at the same frequency take turns rather than starving one', () => {
    expect(shape(config({ gendered: 1, mixed: 1 }), 8)).toBe('G M G M G M G M');
    expect(shape(config({ gendered: 2, mixed: 2 }), 8)).toBe('G M G M G M G M');
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
      .toBe('M G M G M G');
  });

  it("leaves the rarer type first even when the host puts another above it", () => {
    // Rarity has to outrank the host's order, or a frequent type placed on top
    // would keep bumping a rare one until it never played.
    expect(shape(config({ gendered: 4, mixed: 2 }, ['mixed', 'gendered', 'skill']), 8))
      .toBe('G M — M G M — M');
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

describe('moveType', () => {
  it('swaps a type one place up', () => {
    const cfg = moveType(DEFAULT_SPECIAL_TYPES, 'mixed', -1);
    expect(orderedTypes(cfg)).toEqual(['mixed', 'gendered', 'skill']);
  });

  it('swaps a type one place down', () => {
    const cfg = moveType(DEFAULT_SPECIAL_TYPES, 'gendered', 1);
    expect(orderedTypes(cfg)).toEqual(['mixed', 'gendered', 'skill']);
  });

  it('does nothing at either end', () => {
    expect(orderedTypes(moveType(DEFAULT_SPECIAL_TYPES, 'gendered', -1)))
      .toEqual(['gendered', 'mixed', 'skill']);
    expect(orderedTypes(moveType(DEFAULT_SPECIAL_TYPES, 'skill', 1)))
      .toEqual(['gendered', 'mixed', 'skill']);
  });

  it('changes which type opens the session', () => {
    const cfg = config({ gendered: 2, mixed: 2 });
    expect(shape(cfg, 2)).toBe('G M');
    expect(shape(moveType(cfg, 'mixed', -1), 2)).toBe('M G');
  });
});

describe('specialSummary', () => {
  it('reads back what is switched on, with the rounds it lands on', () => {
    expect(specialSummary(config({ gendered: 4, mixed: 2 }), 8)).toEqual([
      { type: 'gendered', headline: 'Gendered every 4 rounds', rounds: [1, 5] },
      { type: 'mixed', headline: 'Mixed every 2 rounds', rounds: [2, 4, 6, 8] },
    ]);
  });

  it('says "every round" rather than "every 1 rounds"', () => {
    expect(specialSummary(config({ skill: 1 }), 3)[0].headline).toBe('Equal Skill every round');
  });

  it('reports no rounds for a type the session never reaches', () => {
    // Mixed takes round 1 as the rarer type, and gendered is not due again
    // within two rounds.
    const summary = specialSummary(config({ gendered: 1, mixed: 8 }), 2);
    expect(summary.find((s) => s.type === 'mixed')?.rounds).toEqual([1]);
    expect(summary.find((s) => s.type === 'gendered')?.rounds).toEqual([2]);
    expect(specialSummary(config({ skill: 8 }), 4)[0].rounds).toEqual([1]);
  });

  it('agrees with the plan exactly', () => {
    const cfg = config({ gendered: 3, mixed: 2, skill: 5 });
    const plan = planRoundTypes(cfg, 10);
    for (const s of specialSummary(cfg, 10)) {
      expect(s.rounds).toEqual(plan.flatMap((t, i) => (t === s.type ? [i + 1] : [])));
    }
  });

  it('says nothing when nothing is switched on', () => {
    expect(specialSummary(DEFAULT_SPECIAL_TYPES, 8)).toEqual([]);
  });

  it('follows the order the host put them in', () => {
    const cfg = config({ gendered: 2, mixed: 2 }, ['mixed', 'gendered', 'skill']);
    expect(specialSummary(cfg, 4).map((s) => s.type)).toEqual(['mixed', 'gendered']);
  });
});

describe('roundTypeOf', () => {
  const bare = { roundNumber: 1, courts: [], sitOuts: [] };

  it('reads a round built by this version', () => {
    expect(roundTypeOf({ ...bare, roundType: 'mixed' })).toBe('mixed');
  });

  it('reads a schedule saved before game types were named', () => {
    expect(roundTypeOf({ ...bare, isGendered: true })).toBe('gendered');
  });

  it('returns nothing for an ordinary round', () => {
    expect(roundTypeOf(bare)).toBeNull();
  });
});

describe('courtMatchesType', () => {
  const player = (gender: Gender, rating = 4.0): Player =>
    ({ id: `${gender}${rating}${Math.random()}`, name: 'P', rating, gender, rosterIds: ['r1'] });

  const court = (g1: Gender, g2: Gender, g3: Gender, g4: Gender): CourtAssignment => ({
    courtNumber: 1,
    team1: [player(g1), player(g2)],
    team2: [player(g3), player(g4)],
    ratingDiff: 0,
  });

  it('accepts a court of one gender on a gendered round', () => {
    expect(courtMatchesType(court('M', 'M', 'M', 'M'), 'gendered')).toBe(true);
    expect(courtMatchesType(court('F', 'F', 'F', 'F'), 'gendered')).toBe(true);
  });

  it('rejects the leftovers a gendered round could not fill', () => {
    expect(courtMatchesType(court('M', 'F', 'M', 'F'), 'gendered')).toBe(false);
    // Men against women is not men playing men, however tidy the teams look.
    expect(courtMatchesType(court('M', 'M', 'F', 'F'), 'gendered')).toBe(false);
  });

  it('wants one of each gender on both teams of a mixed round', () => {
    expect(courtMatchesType(court('M', 'F', 'F', 'M'), 'mixed')).toBe(true);
    expect(courtMatchesType(court('M', 'M', 'F', 'F'), 'mixed')).toBe(false);
    expect(courtMatchesType(court('M', 'F', 'M', 'M'), 'mixed')).toBe(false);
  });

  it('takes every court of a skill round, which is a band by construction', () => {
    expect(courtMatchesType(court('M', 'F', 'M', 'F'), 'skill')).toBe(true);
  });

  it('rejects a short-handed mixed court rather than reading past the end', () => {
    const short: CourtAssignment = {
      courtNumber: 1,
      team1: [player('M')],
      team2: [player('F'), player('M')],
      ratingDiff: 0,
    };
    expect(courtMatchesType(short, 'mixed')).toBe(false);
  });
});
