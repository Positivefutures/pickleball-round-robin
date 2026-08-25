import { describe, it, expect } from 'vitest';
import { extendSchedule, generateSchedule, regenerateRemaining } from './pairing';
import { addToRemainingRounds, replacePlayerInRounds } from './sitout';
import type { Player, Round, RoundPlan, Schedule } from '../types';

// Containment: a schedule may only ever hold the players it was built from.
// The bug of 2026-08-24 — names on the sheet nobody ticked — lived entirely in
// what App.tsx handed this module, and these tests are what keeps that true.
// Every id that comes out must have gone in, and every round must seat or
// bench the whole list exactly once.

function makePlayers(n: number, prefix = 'p'): Player[] {
  const names = ['Ann','Bob','Cal','Dee','Eli','Fay','Gus','Hal','Ivy','Joe','Kim','Lou','Mia','Ned'];
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    name: names[i] ?? `P${i}`,
    rating: 3.0 + (i % 5) * 0.25,
    gender: i % 2 === 0 ? 'M' : 'F',
  }));
}

const roundIds = (r: Round): string[] => [
  ...r.courts.flatMap((c) => [...c.team1, ...c.team2]),
  ...r.sitOuts,
].map((p) => p.id);

// Exact cover: the round holds every input player once — no strangers, no
// duplicates, nobody missing. Sorted multisets so the failure message names
// the ids that differ.
function expectExactCover(s: Schedule, players: Player[]) {
  const want = players.map((p) => p.id).sort();
  for (const r of s.rounds) {
    expect(roundIds(r).sort()).toEqual(want);
  }
}

describe('generateSchedule containment', () => {
  // Court counts past what the list can fill collapse to the same build, so
  // each size tries one court, a middling count and the most it can use.
  it('seats or benches exactly the players given, across sizes, courts and plans', () => {
    const plans: RoundPlan[] = [
      [],
      ['gendered', null, 'mixed', null, 'skill', null],
      ['mixed', 'mixed', 'gendered', 'skill', null, 'gendered'],
    ];
    for (const n of [4, 5, 7, 9, 10, 13, 16, 24]) {
      for (const courts of new Set([1, 2, Math.floor(n / 4)])) {
        for (const plan of plans) {
          const players = makePlayers(n);
          expectExactCover(generateSchedule(players, courts, 6, plan), players);
        }
      }
    }
  }, 20000);

  it('never materialises a player a partnership names but the list does not hold', () => {
    const players = makePlayers(12);
    const partnerships = [
      { player1Id: 'p0', player2Id: 'p1' },
      { player1Id: 'p2', player2Id: 'ghost-a' }, // half absent
      { player1Id: 'ghost-b', player2Id: 'ghost-c' }, // wholly absent
    ];
    const s = generateSchedule(players, 3, 6, [], partnerships);
    expectExactCover(s, players);
    // The couple that does resolve still plays as one.
    for (const r of s.rounds) {
      for (const c of r.courts) {
        for (const team of [c.team1, c.team2]) {
          const ids = team.map((p) => p.id);
          if (ids.includes('p0') || ids.includes('p1')) {
            expect(ids).toEqual(expect.arrayContaining(['p0', 'p1']));
          }
        }
      }
    }
  });
});

describe('regenerateRemaining containment', () => {
  it('keeps completed rounds by reference and rebuilds the rest from the new list only', () => {
    const before = makePlayers(14);
    const s = generateSchedule(before, 3, 6);
    // Two went home. The rounds already played keep them — they are history —
    // and every round still to come must hold exactly who is left.
    const after = before.filter((p) => p.id !== 'p3' && p.id !== 'p8');
    const out = regenerateRemaining(after, 3, s.rounds, [1, 2]);
    expect(out.rounds[0]).toBe(s.rounds[0]);
    expect(out.rounds[1]).toBe(s.rounds[1]);
    const want = after.map((p) => p.id).sort();
    for (const r of out.rounds.slice(2)) {
      expect(roundIds(r).sort()).toEqual(want);
    }
  });

  it('drops a lock and a broken pair naming somebody who has left, rather than seating them', () => {
    const before = makePlayers(9);
    const s = generateSchedule(before, 2, 5);
    const after = before.filter((p) => p.id !== 'p4');
    const out = regenerateRemaining(
      after, 2, s.rounds, [1],
      [],
      [{ player1Id: 'p0', player2Id: 'p4' }],
      { 2: [{ player1Id: 'p4', player2Id: 'p1', courtIdx: 0, team: 'team1' }] },
      { 3: ['p4|p5'] }
    );
    const want = after.map((p) => p.id).sort();
    for (const r of out.rounds.slice(1)) {
      expect(roundIds(r).sort()).toEqual(want);
    }
  });
});

describe('extendSchedule containment', () => {
  it('appends rounds holding exactly the players given and leaves the old ones alone', () => {
    const players = makePlayers(10);
    const s = generateSchedule(players, 2, 4);
    const out = extendSchedule(players, 2, s.rounds, 2);
    expect(out.rounds).toHaveLength(6);
    for (let i = 0; i < 4; i++) expect(out.rounds[i]).toBe(s.rounds[i]);
    const want = players.map((p) => p.id).sort();
    for (const r of out.rounds.slice(4)) {
      expect(roundIds(r).sort()).toEqual(want);
    }
  });
});

describe('roster-edit helpers containment', () => {
  it('addToRemainingRounds adds the one player and nobody else, skipping completed rounds', () => {
    const players = makePlayers(9);
    const s = generateSchedule(players, 2, 4);
    const [late] = makePlayers(1, 'late');
    const out = addToRemainingRounds(s.rounds, [1], late);
    expect(out[0]).toBe(s.rounds[0]);
    const want = [...players.map((p) => p.id), late.id].sort();
    for (const r of out.slice(1)) {
      expect(roundIds(r).sort()).toEqual(want);
    }
  });

  it('replacePlayerInRounds swaps one id for another and touches nothing else', () => {
    const players = makePlayers(8);
    const s = generateSchedule(players, 2, 4);
    const [sub] = makePlayers(1, 'sub');
    const out = replacePlayerInRounds(s.rounds, 'p5', sub, [2]);
    expect(out[1]).toBe(s.rounds[1]); // skipped round untouched
    const swapped = [...players.filter((p) => p.id !== 'p5').map((p) => p.id), sub.id].sort();
    const kept = players.map((p) => p.id).sort();
    out.forEach((r, i) => {
      expect(roundIds(r).sort()).toEqual(s.rounds[i] === r ? kept : swapped);
    });
  });
});
