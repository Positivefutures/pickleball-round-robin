// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations, KEYS, DEFAULT_ROSTER_NAME } from './migrations';
import type { Player } from '../types';

const seed = (obj: Record<string, unknown>) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(obj)) localStorage.setItem(k, JSON.stringify(v));
};
const read = <T>(key: string): T => JSON.parse(localStorage.getItem(key) || 'null');

beforeEach(() => localStorage.clear());

describe('runMigrations — rosters', () => {
  it('creates a default group on a fresh install', () => {
    runMigrations();
    const rosters = read<{ id: string; name: string }[]>(KEYS.rosters);
    expect(rosters).toHaveLength(1);
    expect(rosters[0].name).toBe(DEFAULT_ROSTER_NAME);
    expect(read<string>(KEYS.activeRoster)).toBe(rosters[0].id);
    expect(read<number[]>(KEYS.completedRounds)).toEqual([]);
    expect(read<unknown[]>(KEYS.partnerships)).toEqual([]);
  });

  it('leaves existing partnerships untouched', () => {
    const existing = [{ player1Id: 'a', player2Id: 'b' }];
    seed({ [KEYS.partnerships]: existing });
    runMigrations();
    expect(read<unknown[]>(KEYS.partnerships)).toEqual(existing);
  });

  it('assigns legacy players (no rosterIds) to the default group and maps the core-import flag', () => {
    seed({
      [KEYS.players]: [
        { id: 'a', name: 'Jeff B', rating: 4.0, gender: 'M' },
        { id: 'b', name: 'Susan K', rating: 3.5, gender: 'F' },
      ],
      [KEYS.legacyCoreImported]: true,
    });
    runMigrations();
    const rosters = read<{ id: string }[]>(KEYS.rosters);
    const players = read<Player[]>(KEYS.players);
    expect(players).toHaveLength(2);
    expect(players.every((p) => p.rosterIds.length === 1 && p.rosterIds[0] === rosters[0].id)).toBe(true);
    expect(read<string[]>(KEYS.coreImportedRosters)).toEqual([rosters[0].id]);
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
