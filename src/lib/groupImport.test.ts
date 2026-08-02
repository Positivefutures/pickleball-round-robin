import { describe, it, expect } from 'vitest';
import { planImport } from './groupImport';
import type { ImportGroup } from './groupImport';
import type { Player } from '../types';

function pooled(name: string, rosterIds: string[] = ['old']): Player {
  return { id: `id-${name}`, name, rating: 4, gender: 'M', rosterIds };
}

function row(name: string, rating = 4, gender: 'M' | 'F' = 'M') {
  return { name, rating, gender };
}

/** Deterministic ids, so assertions can name them. */
function ids() {
  let n = 0;
  return () => `new-${++n}`;
}

/** Applies a plan the way usePlayers does, to assert on the resulting pool. */
function applied(players: Player[], groups: ImportGroup[]): Player[] {
  const plan = planImport(players, groups, ids());
  return [
    ...players.map((p) => {
      const extra = plan.links.get(p.id);
      return extra ? { ...p, rosterIds: Array.from(new Set([...p.rosterIds, ...extra])) } : p;
    }),
    ...plan.created,
  ];
}

describe('planImport', () => {
  it('creates players a single group introduces', () => {
    const plan = planImport([], [{ rosterId: 'r1', rows: [row('Ana'), row('Ben')] }], ids());
    expect(plan.created.map((p) => p.name)).toEqual(['Ana', 'Ben']);
    expect(plan.created.every((p) => p.rosterIds.length === 1)).toBe(true);
    expect(plan.counts).toEqual([{ added: 2, linked: 0 }]);
  });

  it('links a player already in the pool instead of duplicating them', () => {
    const plan = planImport([pooled('Ana')], [{ rosterId: 'r1', rows: [row('ana')] }], ids());
    expect(plan.created).toEqual([]);
    expect(plan.links.get('id-Ana')).toEqual(['r1']);
    expect(plan.counts).toEqual([{ added: 0, linked: 1 }]);
  });

  it('keeps the pool rating and gender for someone the file already knows', () => {
    const pool = [{ ...pooled('Ana'), rating: 3.5, gender: 'F' as const }];
    const after = applied(pool, [{ rosterId: 'r1', rows: [row('Ana', 5, 'M')] }]);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ rating: 3.5, gender: 'F' });
  });

  // The reason planImport takes every group at once. Handled one group at a
  // time against React state, the second group would not yet see the player the
  // first one created and would make a second copy.
  it('creates a player listed in two groups once, in both groups', () => {
    const after = applied([], [
      { rosterId: 'r1', rows: [row('Ana'), row('Ben')] },
      { rosterId: 'r2', rows: [row('Ana')] },
    ]);
    expect(after.map((p) => p.name)).toEqual(['Ana', 'Ben']);
    expect(after.find((p) => p.name === 'Ana')!.rosterIds).toEqual(['r1', 'r2']);
    expect(after.find((p) => p.name === 'Ben')!.rosterIds).toEqual(['r1']);
  });

  it('links an existing player into every group of the file that lists them', () => {
    const after = applied([pooled('Ana')], [
      { rosterId: 'r1', rows: [row('Ana')] },
      { rosterId: 'r2', rows: [row('Ana')] },
    ]);
    expect(after).toHaveLength(1);
    expect(after[0].rosterIds).toEqual(['old', 'r1', 'r2']);
  });

  it('counts a file-created player as added in each group, never as linked', () => {
    const plan = planImport([], [
      { rosterId: 'r1', rows: [row('Ana')] },
      { rosterId: 'r2', rows: [row('Ana')] },
    ], ids());
    expect(plan.counts).toEqual([{ added: 1, linked: 0 }, { added: 1, linked: 0 }]);
    expect(plan.created).toHaveLength(1);
  });

  it('leaves players the file never mentions alone', () => {
    const after = applied([pooled('Zed', ['old'])], [{ rosterId: 'r1', rows: [row('Ana')] }]);
    expect(after.find((p) => p.name === 'Zed')!.rosterIds).toEqual(['old']);
  });

  it('does no work for an empty file', () => {
    const plan = planImport([pooled('Ana')], [], ids());
    expect(plan.created).toEqual([]);
    expect(plan.links.size).toBe(0);
    expect(plan.counts).toEqual([]);
  });
});
