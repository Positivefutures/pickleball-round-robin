import { describe, it, expect } from 'vitest';
import { generateSchedule, regenerateRemaining, effectiveCourtCount } from './pairing';
import { addToRemainingSitOuts } from './sitout';
import { partnerKey } from './partnerships';
import type { Player, Schedule } from '../types';

function makePlayers(n: number): Player[] {
  const names = ['Ann','Bob','Cal','Dee','Eli','Fay','Gus','Hal','Ivy','Joe','Kim','Lou','Mia','Ned'];
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: names[i] ?? `P${i}`,
    rating: 3.0 + (i % 5) * 0.25,
    gender: i % 2 === 0 ? 'M' : 'F',
  }));
}

function partnerRepeats(s: Schedule): number {
  const m = new Map<string, number>();
  for (const r of s.rounds) {
    for (const c of r.courts) {
      for (const t of [c.team1, c.team2]) {
        if (t.length === 2) {
          const k = [t[0].id, t[1].id].sort().join('+');
          m.set(k, (m.get(k) ?? 0) + 1);
        }
      }
    }
  }
  return m.size ? Math.max(...m.values()) : 0;
}

function sitOutSpread(rounds: Schedule['rounds'], ids: string[]): number {
  const counts = new Map(ids.map((id) => [id, 0]));
  for (const r of rounds) {
    for (const p of r.sitOuts) if (counts.has(p.id)) counts.set(p.id, counts.get(p.id)! + 1);
  }
  const vals = [...counts.values()];
  return Math.max(...vals) - Math.min(...vals);
}

const roundNumbers = (s: Schedule) => s.rounds.map((r) => r.roundNumber);

describe('effectiveCourtCount', () => {
  it('caps courts at what the player count can fill', () => {
    expect(effectiveCourtCount(12, 3)).toBe(3);
    expect(effectiveCourtCount(11, 3)).toBe(2); // 11 players -> only 2 full courts
    expect(effectiveCourtCount(7, 3)).toBe(1);
    expect(effectiveCourtCount(3, 3)).toBe(0);
  });
});

describe('generateSchedule', () => {
  it('fills every court with no sit-outs when players divide evenly', () => {
    const s = generateSchedule(makePlayers(12), 3, 8);
    expect(s.rounds).toHaveLength(8);
    for (const r of s.rounds) {
      expect(r.courts).toHaveLength(3);
      expect(r.sitOuts).toHaveLength(0);
    }
  });

  it('keeps every court within the 0.5 rating cap where achievable', () => {
    const s = generateSchedule(makePlayers(12), 3, 8);
    const diffs = s.rounds.flatMap((r) => r.courts.map((c) => c.ratingDiff));
    expect(Math.max(...diffs)).toBeLessThanOrEqual(0.5 + 1e-9);
  });
});

describe('regenerateRemaining', () => {
  const players = makePlayers(12);
  const original = generateSchedule(players, 3, 8);

  it('keeps a prefix of completed rounds verbatim and rebuilds the rest', () => {
    const completed = [1, 2, 3, 4];
    const removed = players[7];
    const remaining = players.filter((p) => p.id !== removed.id);
    const regen = regenerateRemaining(remaining, 3, original.rounds, completed);

    expect(roundNumbers(regen)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // numeric order preserved
    expect(regen.rounds.slice(0, 4)).toEqual(original.rounds.slice(0, 4)); // untouched

    const tail = regen.rounds.slice(4);
    for (const r of tail) {
      expect(r.courts).toHaveLength(2); // court dropped: 11 players -> 2 courts
      expect(r.sitOuts).toHaveLength(3);
    }
    const present = tail.some((r) =>
      [...r.courts.flatMap((c) => [...c.team1, ...c.team2]), ...r.sitOuts].some((p) => p.id === removed.id)
    );
    expect(present).toBe(false); // removed player absent from rebuilt rounds
  });

  it('distributes sit-outs fairly across rebuilt rounds', () => {
    const removed = players[7];
    const remaining = players.filter((p) => p.id !== removed.id);
    const regen = regenerateRemaining(remaining, 3, original.rounds, [1, 2, 3, 4]);
    const spread = sitOutSpread(regen.rounds.slice(4), remaining.map((p) => p.id));
    expect(spread).toBeLessThanOrEqual(1);
  });

  it('does not over-repeat partners after regeneration', () => {
    const removed = players[7];
    const remaining = players.filter((p) => p.id !== removed.id);
    const regen = regenerateRemaining(remaining, 3, original.rounds, [1, 2, 3, 4]);
    expect(partnerRepeats(regen)).toBeLessThanOrEqual(2);
  });

  it('keeps an ARBITRARY (out-of-order) completed set verbatim', () => {
    const completed = [1, 2, 4]; // round 4 completed before round 3
    const removed = players[6];
    const remaining = players.filter((p) => p.id !== removed.id);
    const regen = regenerateRemaining(remaining, 3, original.rounds, completed);

    expect(roundNumbers(regen)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // still numeric order internally
    for (const n of completed) {
      expect(regen.rounds[n - 1]).toEqual(original.rounds[n - 1]); // kept exactly
    }
    // Removed player gone from the incomplete rounds, still present in completed ones
    const incomplete = [3, 5, 6, 7, 8];
    const inIncomplete = incomplete.some((n) =>
      [...regen.rounds[n - 1].courts.flatMap((c) => [...c.team1, ...c.team2]), ...regen.rounds[n - 1].sitOuts]
        .some((p) => p.id === removed.id)
    );
    expect(inIncomplete).toBe(false);
  });

  it('regenerates every round when nothing is completed', () => {
    const removed = players[7];
    const remaining = players.filter((p) => p.id !== removed.id);
    const regen = regenerateRemaining(remaining, 3, original.rounds, []);
    expect(regen.rounds).toHaveLength(8);
    for (const r of regen.rounds) {
      expect(r.courts).toHaveLength(2);
      expect(r.sitOuts).toHaveLength(3);
    }
  });

  it('returns the schedule unchanged when every round is completed', () => {
    const remaining = players.filter((p) => p.id !== players[7].id);
    const all = original.rounds.map((r) => r.roundNumber);
    const regen = regenerateRemaining(remaining, 3, original.rounds, all);
    expect(regen.rounds).toEqual(original.rounds);
  });

  it('handles a removal that leaves exactly two full courts', () => {
    const eight = players.slice(0, 8);
    const regen = regenerateRemaining(eight, 3, original.rounds, [1, 2, 3, 4]);
    for (const r of regen.rounds.slice(4)) {
      expect(r.courts).toHaveLength(2);
      expect(r.sitOuts).toHaveLength(0);
    }
  });

  it('honours a lock on a rebuilt round', () => {
    const [a, b] = players;
    const regen = regenerateRemaining(
      players, 3, original.rounds, [1, 2, 3, 4], false, 2, [],
      { 4: [{ player1Id: a.id, player2Id: b.id, courtIdx: 0, team: 'team1' }] }
    );
    const team1 = regen.rounds[4].courts[0].team1.map((p) => p.id);
    expect(team1).toContain(a.id);
    expect(team1).toContain(b.id);
  });

  it('frees a couple broken for one round only', () => {
    const [a, b] = players;
    const couple = [{ player1Id: a.id, player2Id: b.id }];
    const regen = regenerateRemaining(
      players, 3, original.rounds, [1, 2, 3, 4], false, 2, couple,
      {}, { 4: [partnerKey(a.id, b.id)] }
    );

    const together = (roundIdx: number) =>
      regen.rounds[roundIdx].courts.some((c) =>
        [c.team1, c.team2].some(
          (t) => t.some((p) => p.id === a.id) && t.some((p) => p.id === b.id)
        )
      );

    expect(together(4)).toBe(false); // broken here
    expect(together(5)).toBe(true); // and nowhere else
  });
});

// The scenario from the feature request: a latecomer joins a session already
// several rounds in, and should not immediately displace someone who has yet to
// sit out. Nothing special-cases this — determineSitOuts orders by games played,
// and the newcomer has none.
describe('a player added mid-session', () => {
  it('sits only after everyone who has not sat out yet', () => {
    const nine = makePlayers(9);
    const original = generateSchedule(nine, 2, 8); // 8 play, 1 sits each round
    const completed = [1, 2, 3, 4];

    const satAlready = new Set(
      original.rounds
        .filter((r) => completed.includes(r.roundNumber))
        .flatMap((r) => r.sitOuts.map((p) => p.id))
    );
    const neverSat = nine.filter((p) => !satAlready.has(p.id));
    expect(satAlready.size).toBe(4);
    expect(neverSat).toHaveLength(5);

    // Drop the newcomer into the unplayed rounds, then reshuffle as the host would.
    const latecomer: Player = {
      id: 'late', name: 'Zoe', rating: 4, gender: 'F', rosterIds: ['r1'],
    };
    const withLatecomer = addToRemainingSitOuts(original.rounds, completed, latecomer);
    const regen = regenerateRemaining([...nine, latecomer], 2, withLatecomer, completed);

    // Round 5: ten players over two courts, so two sit — and both should come
    // from the five who have never sat, not the newcomer.
    const firstRebuilt = regen.rounds[4];
    expect(firstRebuilt.sitOuts).toHaveLength(2);
    expect(firstRebuilt.sitOuts.map((p) => p.id)).not.toContain(latecomer.id);
    for (const p of firstRebuilt.sitOuts) {
      expect(neverSat.map((n) => n.id)).toContain(p.id);
    }
  });

  it('is left in the sit-outs of unplayed rounds until the host acts', () => {
    const nine = makePlayers(9);
    const original = generateSchedule(nine, 2, 8);
    const latecomer: Player = {
      id: 'late', name: 'Zoe', rating: 4, gender: 'F', rosterIds: ['r1'],
    };
    const next = addToRemainingSitOuts(original.rounds, [1, 2], latecomer);

    expect(next[0].sitOuts.map((p) => p.id)).not.toContain(latecomer.id);
    for (const r of next.slice(2)) {
      expect(r.sitOuts.map((p) => p.id)).toContain(latecomer.id);
    }
  });
});
