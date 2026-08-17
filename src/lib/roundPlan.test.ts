import { describe, it, expect } from 'vitest';
import type { RoundPlan } from '../types';
import {
  PLAN_SLOTS, emptyPlan, moveRound, normalizeRoundPlan, planAt, planChips, planKey,
  setPlanType, unplayedChanged,
} from './roundPlan';

/** "— G — M" — one letter per round, easier to read than an array of strings. */
function shape(plan: RoundPlan, numRounds = plan.length): string {
  return Array.from({ length: numRounds }, (_, i) => {
    const t = planAt(plan, i + 1);
    return t ? t[0].toUpperCase() : '—';
  }).join(' ');
}

describe('emptyPlan', () => {
  it('is sixteen ordinary rounds', () => {
    expect(emptyPlan()).toEqual(Array(PLAN_SLOTS).fill(null));
  });

  it('is a fresh array each time, so two stores cannot share one', () => {
    const a = emptyPlan();
    a[0] = 'mixed';
    expect(emptyPlan()[0]).toBeNull();
  });
});

describe('normalizeRoundPlan', () => {
  it('pads a short plan out to sixteen', () => {
    const plan = normalizeRoundPlan(['gendered']);
    expect(plan).toHaveLength(PLAN_SLOTS);
    expect(plan[0]).toBe('gendered');
    expect(plan[15]).toBeNull();
  });

  it('pads further when asked for more than sixteen', () => {
    expect(normalizeRoundPlan([], 20)).toHaveLength(20);
  });

  it('never shortens a plan that is already longer', () => {
    expect(normalizeRoundPlan(Array(20).fill(null))).toHaveLength(20);
  });

  /**
   * A plan arrives over sync, from an account another device wrote and
   * possibly a later build with a fourth type in it. An unknown word would go
   * on to index ROUND_TYPE_META and take the page down.
   */
  it('turns anything it does not recognise into an ordinary round', () => {
    const plan = normalizeRoundPlan(['gendered', 'doubles', 42, undefined, null, {}]);
    expect(shape(plan, 6)).toBe('G — — — — —');
  });

  it('answers an empty plan for something that is not a list at all', () => {
    expect(normalizeRoundPlan(null)).toEqual(emptyPlan());
    expect(normalizeRoundPlan({ gendered: 2 })).toEqual(emptyPlan());
  });
});

describe('planAt', () => {
  it('reads round 1 out of slot 0', () => {
    expect(planAt(['mixed', 'skill'], 1)).toBe('mixed');
    expect(planAt(['mixed', 'skill'], 2)).toBe('skill');
  });

  // handleAddRounds can push a session past the slots the plan has.
  it('answers ordinary past the end of the plan', () => {
    expect(planAt(['mixed'], 9)).toBeNull();
    expect(planAt([], 1)).toBeNull();
  });
});

describe('setPlanType', () => {
  it('sets one round and leaves the rest', () => {
    expect(shape(setPlanType(emptyPlan(), 3, 'mixed'), 4)).toBe('— — M —');
  });

  it('puts a round back to ordinary', () => {
    const plan = setPlanType(emptyPlan(), 3, 'mixed');
    expect(shape(setPlanType(plan, 3, null), 4)).toBe('— — — —');
  });

  it('grows the plan to reach a round past its end', () => {
    expect(setPlanType([], 20, 'skill')).toHaveLength(20);
  });

  it('does not touch the plan it was given', () => {
    const plan = emptyPlan();
    setPlanType(plan, 1, 'gendered');
    expect(plan[0]).toBeNull();
  });
});

describe('moveRound', () => {
  const none = new Set<number>();
  /** Round 2 gendered, round 4 mixed, in a session of five. */
  const plan: RoundPlan = normalizeRoundPlan([null, 'gendered', null, 'mixed', null]);

  it('moves a type up, sliding the rounds between it along', () => {
    expect(shape(moveRound(plan, 2, 1, 5, none), 5)).toBe('G — — M —');
  });

  it('moves a type down', () => {
    expect(shape(moveRound(plan, 2, 4, 5, none), 5)).toBe('— — M G —');
  });

  it('is a no-op moving a round onto itself', () => {
    expect(moveRound(plan, 2, 2, 5, none)).toBe(plan);
  });

  it('is a no-op for a round outside the session', () => {
    expect(moveRound(plan, 2, 9, 5, none)).toBe(plan);
    expect(moveRound(plan, 0, 1, 5, none)).toBe(plan);
  });

  it('is a permutation: the same types, in a different order', () => {
    const moved = moveRound(plan, 4, 1, 5, none);
    const count = (p: RoundPlan) => p.slice(0, 5).filter(Boolean).sort().join(',');
    expect(count(moved)).toBe(count(plan));
  });

  /**
   * A round already played keeps both its type and its position. The list has
   * to go on reading ROUND 1..N with the played ones where they were, so only
   * the open slots are reordered, among themselves.
   */
  it('steps over a locked round rather than through it', () => {
    // Round 2 is played and gendered. Moving round 4's mixed up to round 1
    // must leave round 2 exactly where it is.
    const locked = new Set([2]);
    expect(shape(moveRound(plan, 4, 1, 5, locked), 5)).toBe('M G — — —');
  });

  it('will not move a locked round', () => {
    expect(moveRound(plan, 2, 1, 5, new Set([2]))).toBe(plan);
  });

  it('will not land on a locked round', () => {
    expect(moveRound(plan, 4, 2, 5, new Set([2]))).toBe(plan);
  });

  it('leaves the slots past the session alone', () => {
    const withTail = setPlanType(plan, 10, 'skill');
    expect(planAt(moveRound(withTail, 2, 4, 5, none), 10)).toBe('skill');
  });
});

describe('planChips', () => {
  it('names each special round and skips the ordinary ones', () => {
    const plan = normalizeRoundPlan([null, null, null, 'gendered', null, 'mixed']);
    expect(planChips(plan, 8).map((c) => c.label)).toEqual(['R4 Gendered', 'R6 Mixed']);
  });

  it('says nothing about rounds the session does not reach', () => {
    expect(planChips(setPlanType(emptyPlan(), 10, 'skill'), 8)).toEqual([]);
  });
});

describe('planKey', () => {
  it('is the same string for the same plan', () => {
    expect(planKey(emptyPlan(), 8)).toBe(planKey(emptyPlan(), 8));
  });

  it('changes when a round changes', () => {
    expect(planKey(setPlanType(emptyPlan(), 2, 'mixed'), 8)).not.toBe(planKey(emptyPlan(), 8));
  });

  /**
   * The truncation guarantee. Without it a type sitting in a slot past the
   * visible list changes the key, and the Schedule tab shuts for a round
   * nobody can see.
   */
  it('ignores everything past the session', () => {
    expect(planKey(setPlanType(emptyPlan(), 10, 'gendered'), 1))
      .toBe(planKey(emptyPlan(), 1));
  });
});

describe('unplayedChanged', () => {
  const before = normalizeRoundPlan([null, 'gendered', null, null]);

  it('is false for a plan nobody touched', () => {
    expect(unplayedChanged(before, normalizeRoundPlan(before), 4, [])).toBe(false);
  });

  it('is true when a round still to come changed', () => {
    expect(unplayedChanged(before, setPlanType(before, 3, 'mixed'), 4, [1, 2])).toBe(true);
  });

  // Nothing is going to rebuild a round already on the board, so a change to
  // one is not a reason to rebuild the rest of the afternoon.
  it('is false when only a round already played changed', () => {
    expect(unplayedChanged(before, setPlanType(before, 2, 'skill'), 4, [1, 2])).toBe(false);
  });

  it('ignores rounds past the end of the session', () => {
    expect(unplayedChanged(before, setPlanType(before, 10, 'skill'), 4, [])).toBe(false);
  });

  it('is false when every round is complete', () => {
    const after = setPlanType(before, 1, 'mixed');
    expect(unplayedChanged(before, after, 4, [1, 2, 3, 4])).toBe(false);
  });
});
