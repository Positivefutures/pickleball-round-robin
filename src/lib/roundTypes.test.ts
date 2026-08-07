import { describe, it, expect } from 'vitest';
import type { RoundType, SpecialGameTypes } from '../types';
import {
  DEFAULT_SPECIAL_TYPES, minFrequency, normalizeSpecialTypes, planRoundTypes,
  roundTypeOf, summaryLines,
} from './roundTypes';

function config(on: Partial<Record<RoundType, number>>): SpecialGameTypes {
  const cfg = { ...DEFAULT_SPECIAL_TYPES };
  for (const [type, frequency] of Object.entries(on)) {
    cfg[type as RoundType] = { enabled: true, frequency };
  }
  return cfg;
}

describe('planRoundTypes', () => {
  it('leaves every round ordinary when nothing is switched on', () => {
    expect(planRoundTypes(DEFAULT_SPECIAL_TYPES, 5)).toEqual([null, null, null, null, null]);
  });

  it('plays a lone type on every Nth round', () => {
    expect(planRoundTypes(config({ mixed: 3 }), 8)).toEqual([
      null, null, 'mixed', null, null, 'mixed', null, null,
    ]);
  });

  it('fills every round when the only type is set to every round', () => {
    expect(planRoundTypes(config({ skill: 1 }), 4)).toEqual(['skill', 'skill', 'skill', 'skill']);
  });

  // The worked example the feature was specified from: on the clash at round 4
  // the rarer gendered round wins, and mixed slides to round 5 and counts on
  // from there rather than being skipped.
  it('bumps the loser of a clash to the next round', () => {
    expect(planRoundTypes(config({ gendered: 4, mixed: 2 }), 8)).toEqual([
      null, 'mixed', null, 'gendered', 'mixed', null, 'mixed', 'gendered',
    ]);
  });

  it('never gives one round two game types', () => {
    const plan = planRoundTypes(config({ gendered: 3, mixed: 3, skill: 3 }), 12);
    expect(plan).toHaveLength(12);
    // Each is its own entry, so the only way to double up would be to lose one.
    for (const type of ['gendered', 'mixed', 'skill'] as RoundType[]) {
      expect(plan.filter((t) => t === type).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives all three a fair share when they run together', () => {
    const plan = planRoundTypes(config({ gendered: 3, mixed: 3, skill: 3 }), 9);
    const counts = (['gendered', 'mixed', 'skill'] as RoundType[]).map(
      (t) => plan.filter((x) => x === t).length
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe('normalizeSpecialTypes', () => {
  it('leaves a lone type able to play every round', () => {
    const cfg = normalizeSpecialTypes(config({ gendered: 1 }));
    expect(cfg.gendered.frequency).toBe(1);
  });

  it('raises a frequency of 1 when a second type is switched on', () => {
    const cfg = normalizeSpecialTypes(config({ gendered: 1, mixed: 1 }));
    expect(cfg.gendered.frequency).toBe(2);
    expect(cfg.mixed.frequency).toBe(2);
  });

  it('raises both to 3 when all three are switched on', () => {
    const cfg = normalizeSpecialTypes(config({ gendered: 2, mixed: 5, skill: 1 }));
    expect(cfg.gendered.frequency).toBe(3);
    expect(cfg.mixed.frequency).toBe(5); // already far enough apart, left alone
    expect(cfg.skill.frequency).toBe(3);
  });

  it('caps a frequency at 8', () => {
    expect(normalizeSpecialTypes(config({ skill: 99 })).skill.frequency).toBe(8);
  });

  it('leaves a switched-off type where it is', () => {
    expect(minFrequency(config({ gendered: 4 }))).toBe(1);
  });
});

describe('summaryLines', () => {
  it('reads back what is switched on', () => {
    expect(summaryLines(config({ gendered: 4, mixed: 2 }))).toEqual([
      'Gendered every 4 rounds',
      'Mixed every 2 rounds',
    ]);
  });

  it('says "every round" rather than "every 1 rounds"', () => {
    expect(summaryLines(config({ skill: 1 }))).toEqual(['Equal Skill every round']);
  });

  it('says nothing when nothing is switched on', () => {
    expect(summaryLines(DEFAULT_SPECIAL_TYPES)).toEqual([]);
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
