// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations, KEYS, EMPTY_GROUP_NAME } from './migrations';
import type { Player, RoundPlan } from '../types';
import { ROUND_TYPES } from './roundTypes';
import type { SpecialGameTypes } from './legacySpecialTypes';
import { orderedTypes } from './legacySpecialTypes';
import { PLAN_SLOTS } from './roundPlan';

const seed = (obj: Record<string, unknown>) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(obj)) localStorage.setItem(k, JSON.stringify(v));
};
const read = <T>(key: string): T => JSON.parse(localStorage.getItem(key) || 'null');

beforeEach(() => localStorage.clear());

describe('runMigrations — rosters', () => {
  // The literal, not the constant — this pins what a first-time user actually
  // sees, which asserting against the imported constant would not.
  it('drops a first-time user into "Sample Group" with 14 sample players', () => {
    runMigrations();
    const rosters = read<{ id: string; name: string }[]>(KEYS.rosters);
    expect(rosters).toHaveLength(1);
    expect(rosters[0].name).toBe('Sample Group');
    expect(read<string>(KEYS.activeRoster)).toBe(rosters[0].id);

    const players = read<Player[]>(KEYS.players);
    expect(players).toHaveLength(14);
    expect(players.filter((p) => p.gender === 'M')).toHaveLength(7);
    expect(players.filter((p) => p.gender === 'F')).toHaveLength(7);
    expect(players.every((p) => p.rating >= 3.0 && p.rating <= 4.5)).toBe(true);
    // A spread of levels, not one number 14 times over.
    expect(new Set(players.map((p) => p.rating)).size).toBeGreaterThanOrEqual(5);
    // First name and last initial, the way a host would type them.
    expect(players.every((p) => /^[A-Z][a-z]+ [A-Z]\.$/.test(p.name))).toBe(true);
    expect(
      players.every((p) => p.rosterIds.length === 1 && p.rosterIds[0] === rosters[0].id)
    ).toBe(true);

    expect(read<number[]>(KEYS.completedRounds)).toEqual([]);
    expect(read<unknown[]>(KEYS.partnerships)).toEqual([]);
  });

  it('records the example seed so sync can recognise an untouched install', () => {
    runMigrations();
    const rosters = read<{ id: string }[]>(KEYS.rosters);
    const players = read<Player[]>(KEYS.players);
    const meta = read<{ rosterId: string; playerIds: string[] }>(KEYS.exampleMeta);
    expect(meta.rosterId).toBe(rosters[0].id);
    expect([...meta.playerIds].sort()).toEqual(players.map((p) => p.id).sort());
  });

  it('gives a legacy player pool a plain group, never the example one', () => {
    // Players from before groups existed, with no roster list yet. Burying
    // them under 14 strangers would be worse than no seed at all.
    seed({ [KEYS.players]: [{ id: 'a', name: 'Jeff B', rating: 4.0, gender: 'M' }] });
    runMigrations();
    const rosters = read<{ id: string; name: string }[]>(KEYS.rosters);
    expect(rosters).toHaveLength(1);
    expect(rosters[0].name).toBe('My Group');
    expect(EMPTY_GROUP_NAME).toBe('My Group');
    expect(read<Player[]>(KEYS.players)).toHaveLength(1);
    expect(read<unknown>(KEYS.exampleMeta)).toBeNull();
  });

  it('seeds the example only once', () => {
    runMigrations();
    const snapshot = JSON.stringify(localStorage);
    runMigrations();
    expect(JSON.stringify(localStorage)).toBe(snapshot);
    expect(read<Player[]>(KEYS.players)).toHaveLength(14);
  });

  it('never renames a group an existing user already has', () => {
    seed({ [KEYS.rosters]: [{ id: 'r1', name: 'Main Group' }] });
    runMigrations();
    const rosters = read<{ id: string; name: string }[]>(KEYS.rosters);
    expect(rosters).toEqual([{ id: 'r1', name: 'Main Group' }]);
  });

  it('leaves existing partnerships untouched', () => {
    const existing = [{ player1Id: 'a', player2Id: 'b' }];
    seed({ [KEYS.partnerships]: existing });
    runMigrations();
    expect(read<unknown[]>(KEYS.partnerships)).toEqual(existing);
  });

  it('assigns legacy players (no rosterIds) to the default group', () => {
    seed({
      [KEYS.players]: [
        { id: 'a', name: 'Jeff B', rating: 4.0, gender: 'M' },
        { id: 'b', name: 'Susan K', rating: 3.5, gender: 'F' },
      ],
    });
    runMigrations();
    const rosters = read<{ id: string }[]>(KEYS.rosters);
    const players = read<Player[]>(KEYS.players);
    expect(players).toHaveLength(2);
    expect(players.every((p) => p.rosterIds.length === 1 && p.rosterIds[0] === rosters[0].id)).toBe(true);
  });

  it('is idempotent', () => {
    seed({ [KEYS.players]: [{ id: 'a', name: 'Jeff B', rating: 4, gender: 'M' }] });
    runMigrations();
    const snapshot = JSON.stringify(localStorage);
    runMigrations();
    expect(JSON.stringify(localStorage)).toBe(snapshot);
  });

  it('repairs dangling and empty rosterIds without orphaning anyone', () => {
    seed({
      [KEYS.rosters]: [{ id: 'r1', name: 'Tuesday' }],
      [KEYS.activeRoster]: 'r1',
      [KEYS.players]: [
        { id: 'a', name: 'A', rating: 4, gender: 'M', rosterIds: ['gone'] },
        { id: 'b', name: 'B', rating: 4, gender: 'F', rosterIds: ['gone', 'r1'] },
        { id: 'c', name: 'C', rating: 4, gender: 'M', rosterIds: [] },
      ],
    });
    runMigrations();
    const players = read<Player[]>(KEYS.players);
    expect(players.find((p) => p.id === 'a')!.rosterIds).toEqual(['r1']);
    expect(players.find((p) => p.id === 'b')!.rosterIds).toEqual(['r1']);
    expect(players.find((p) => p.id === 'c')!.rosterIds).toEqual(['r1']);
    expect(players.every((p) => p.rosterIds.length > 0)).toBe(true);
  });

  it('corrects an invalid active roster', () => {
    seed({
      [KEYS.rosters]: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }],
      [KEYS.activeRoster]: 'nope',
      [KEYS.players]: [],
    });
    runMigrations();
    expect(read<string>(KEYS.activeRoster)).toBe('r1');
  });
});

describe('runMigrations — completion', () => {
  it('converts a legacy completedThrough count into a set of round numbers', () => {
    seed({ [KEYS.legacyCompletedThrough]: 3 });
    runMigrations();
    expect(read<number[]>(KEYS.completedRounds)).toEqual([1, 2, 3]);
  });

  it('maps a zero count to an empty set', () => {
    seed({ [KEYS.legacyCompletedThrough]: 0 });
    runMigrations();
    expect(read<number[]>(KEYS.completedRounds)).toEqual([]);
  });

  it('keeps an existing completed set over a stale legacy count', () => {
    seed({ [KEYS.completedRounds]: [2, 5], [KEYS.legacyCompletedThrough]: 3 });
    runMigrations();
    expect(read<number[]>(KEYS.completedRounds)).toEqual([2, 5]);
  });
});

describe('runMigrations — special game types', () => {
  it('carries a legacy gendered setting into the three-type config', () => {
    seed({ [KEYS.legacyGenderedEnabled]: true, [KEYS.legacyGenderedFrequency]: 3 });
    runMigrations();
    const cfg = read<SpecialGameTypes>(KEYS.specialTypes);
    expect(cfg.gendered).toEqual({ enabled: true, frequency: 3, order: 0 });
    expect(cfg.mixed.enabled).toBe(false);
    expect(cfg.skill.enabled).toBe(false);
  });

  it('seeds every type switched off for a first-time user', () => {
    runMigrations();
    const cfg = read<SpecialGameTypes>(KEYS.specialTypes);
    expect(ROUND_TYPES.every((t) => !cfg[t].enabled)).toBe(true);
    expect(ROUND_TYPES.map((t) => cfg[t].order)).toEqual([0, 1, 2]);
  });

  // The first release stored no order at all, so it has to be filled in before
  // anything sorts by it — not left until the host next edits the panel.
  it('fills in the order missing from a config saved by the first release', () => {
    seed({
      [KEYS.specialTypes]: {
        gendered: { enabled: true, frequency: 2 },
        mixed: { enabled: true, frequency: 2 },
        skill: { enabled: false, frequency: 2 },
      },
    });
    runMigrations();
    const cfg = read<SpecialGameTypes>(KEYS.specialTypes);
    expect(ROUND_TYPES.map((t) => cfg[t].order)).toEqual([0, 1, 2]);
    expect(cfg.gendered.enabled).toBe(true);
    expect(cfg.mixed.frequency).toBe(2);
  });

  it('leaves an order the host has already set alone', () => {
    seed({
      [KEYS.specialTypes]: {
        gendered: { enabled: true, frequency: 2, order: 2 },
        mixed: { enabled: true, frequency: 2, order: 0 },
        skill: { enabled: false, frequency: 2, order: 1 },
      },
    });
    runMigrations();
    const cfg = read<SpecialGameTypes>(KEYS.specialTypes);
    expect(orderedTypes(cfg)).toEqual(['mixed', 'skill', 'gendered']);
  });
});

/**
 * The frequencies above are now this migration's input, not its output. What a
 * host actually gets is a plan: one entry per round saying what that round is
 * played as, derived once from whatever they had already set, so nobody's
 * session changes shape on upgrade.
 */
describe('runMigrations — the round plan', () => {
  it('lays a legacy frequency out over the rounds it would have landed on', () => {
    seed({
      [KEYS.numRounds]: 8,
      [KEYS.specialTypes]: {
        gendered: { enabled: true, frequency: 2, order: 0 },
        mixed: { enabled: false, frequency: 2, order: 1 },
        skill: { enabled: false, frequency: 2, order: 2 },
      },
    });
    runMigrations();
    expect(read<RoundPlan>(KEYS.roundPlan).slice(0, 8)).toEqual([
      null, 'gendered', null, 'gendered', null, 'gendered', null, 'gendered',
    ]);
  });

  // Sixteen whatever the session's length, because the stepper goes to 16 and
  // the plan is never truncated. Planning further ahead than the host asked
  // for is safe: the old machine only ever looked forwards.
  it('plans all sixteen slots for a session of eight rounds', () => {
    seed({
      [KEYS.numRounds]: 8,
      [KEYS.specialTypes]: {
        gendered: { enabled: true, frequency: 4, order: 0 },
        mixed: { enabled: false, frequency: 2, order: 1 },
        skill: { enabled: false, frequency: 2, order: 2 },
      },
    });
    runMigrations();
    const plan = read<RoundPlan>(KEYS.roundPlan);
    expect(plan).toHaveLength(PLAN_SLOTS);
    expect(plan[11]).toBe('gendered');
  });

  it('gives a first-time user sixteen ordinary rounds', () => {
    runMigrations();
    expect(read<RoundPlan>(KEYS.roundPlan)).toEqual(Array(PLAN_SLOTS).fill(null));
  });

  it('leaves a plan the host already has alone', () => {
    const mine: RoundPlan = ['mixed', null, null, null];
    seed({ [KEYS.roundPlan]: mine });
    runMigrations();
    expect(read<RoundPlan>(KEYS.roundPlan)).toEqual(mine);
  });

  /**
   * A parked group carries its own courts, rounds and round types, so a group
   * restored without a plan would quietly become all-ordinary however the host
   * had set it up. Each one's plan comes off its own settings and its own
   * round count, not the live slot's.
   */
  it('gives every parked group a plan off its own settings', () => {
    seed({
      [KEYS.numRounds]: 8,
      [KEYS.specialTypes]: {
        gendered: { enabled: false, frequency: 2, order: 0 },
        mixed: { enabled: false, frequency: 2, order: 1 },
        skill: { enabled: false, frequency: 2, order: 2 },
      },
      [KEYS.groupSessions]: {
        tuesday: {
          numRounds: 6,
          specialTypes: {
            gendered: { enabled: false, frequency: 2, order: 0 },
            mixed: { enabled: true, frequency: 3, order: 1 },
            skill: { enabled: false, frequency: 2, order: 2 },
          },
        },
      },
    });
    runMigrations();

    const parked = read<Record<string, { roundPlan: RoundPlan }>>(KEYS.groupSessions);
    expect(parked.tuesday.roundPlan.slice(0, 6)).toEqual([
      null, null, 'mixed', null, null, 'mixed',
    ]);
    // And the live slot kept its own answer, which is nothing at all.
    expect(read<RoundPlan>(KEYS.roundPlan)).toEqual(Array(PLAN_SLOTS).fill(null));
  });

  it('leaves a parked group that already has a plan alone', () => {
    seed({
      [KEYS.groupSessions]: {
        tuesday: { numRounds: 6, roundPlan: ['skill', null] },
      },
    });
    runMigrations();
    const parked = read<Record<string, { roundPlan: RoundPlan }>>(KEYS.groupSessions);
    expect(parked.tuesday.roundPlan).toEqual(['skill', null]);
  });
});
