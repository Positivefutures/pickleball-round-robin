import { describe, it, expect } from 'vitest';
import { generateSchedule, regenerateRemaining } from './pairing';
import { arePartners, partnerKey, prunePartnerships, partneredIds } from './partnerships';
import type { Player, Partnership, Schedule } from '../types';

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    rating: 3.0 + (i % 5) * 0.25,
    gender: (i % 2 === 0 ? 'M' : 'F') as 'M' | 'F',
    rosterIds: ['r1'],
  }));
}

// Pairs players (0,1), (2,3), ... up to `count` couples.
function pairFirst(count: number): Partnership[] {
  return Array.from({ length: count }, (_, i) => ({
    player1Id: `p${i * 2}`,
    player2Id: `p${i * 2 + 1}`,
  }));
}

// For every round: each couple is on the same team, or both members sit out —
// never split across teams, and never one playing while the other sits.
function couplesAlwaysIntact(s: Schedule, partnerships: Partnership[]): boolean {
  for (const r of s.rounds) {
    const sitIds = new Set(r.sitOuts.map((p) => p.id));
    for (const pr of partnerships) {
      const bothSit = sitIds.has(pr.player1Id) && sitIds.has(pr.player2Id);
      if (bothSit) continue;
      // Otherwise they must share a team on some court.
      let together = false;
      for (const c of r.courts) {
        for (const t of [c.team1, c.team2]) {
          const ids = t.map((p) => p.id);
          if (ids.includes(pr.player1Id) && ids.includes(pr.player2Id)) together = true;
        }
      }
      if (!together) return false;
    }
  }
  return true;
}

// True if in every round each couple sits as a unit (both or neither).
function couplesSitAsUnit(s: Schedule, partnerships: Partnership[]): boolean {
  for (const r of s.rounds) {
    const sitIds = new Set(r.sitOuts.map((p) => p.id));
    for (const pr of partnerships) {
      const a = sitIds.has(pr.player1Id);
      const b = sitIds.has(pr.player2Id);
      if (a !== b) return false;
    }
  }
  return true;
}

describe('partnership helpers', () => {
  it('partnerKey is order-independent', () => {
    expect(partnerKey('a', 'b')).toBe(partnerKey('b', 'a'));
  });

  it('arePartners matches either ordering', () => {
    const ps: Partnership[] = [{ player1Id: 'a', player2Id: 'b' }];
    expect(arePartners('a', 'b', ps)).toBe(true);
    expect(arePartners('b', 'a', ps)).toBe(true);
    expect(arePartners('a', 'c', ps)).toBe(false);
  });

  it('prunePartnerships drops couples with a missing member', () => {
    const ps: Partnership[] = [
      { player1Id: 'a', player2Id: 'b' },
      { player1Id: 'c', player2Id: 'd' },
    ];
    const kept = prunePartnerships(ps, new Set(['a', 'b', 'c']));
    expect(kept).toEqual([{ player1Id: 'a', player2Id: 'b' }]);
  });

  it('partneredIds collects every paired player', () => {
    expect(partneredIds(pairFirst(2))).toEqual(new Set(['p0', 'p1', 'p2', 'p3']));
  });
});

describe('generateSchedule with partnerships', () => {
  it('keeps every couple on the same team in every round', () => {
    const players = makePlayers(12);
    const partnerships = pairFirst(3); // 3 couples + 6 singles
    const s = generateSchedule(players, 3, 8, false, 2, partnerships);
    expect(couplesAlwaysIntact(s, partnerships)).toBe(true);
  });

  it('all-couples night keeps everyone paired every round', () => {
    const players = makePlayers(12);
    const partnerships = pairFirst(6); // 6 couples, no singles
    const s = generateSchedule(players, 3, 8, false, 2, partnerships);
    expect(couplesAlwaysIntact(s, partnerships)).toBe(true);
    for (const r of s.rounds) {
      expect(r.courts).toHaveLength(3);
      expect(r.sitOuts).toHaveLength(0);
    }
  });

  it('with one sit-out, an unpaired player always sits (never a couple)', () => {
    // 13 players: 6 couples + 1 single, 3 courts -> exactly 1 sits each round.
    const players = makePlayers(13);
    const partnerships = pairFirst(6);
    const single = players[12];
    const s = generateSchedule(players, 3, 8, false, 2, partnerships);
    for (const r of s.rounds) {
      expect(r.sitOuts).toHaveLength(1);
      expect(r.sitOuts[0].id).toBe(single.id);
    }
    expect(couplesAlwaysIntact(s, partnerships)).toBe(true);
  });

  it('with two sit-outs, couples sit out together', () => {
    // 14 players: 5 couples + 4 singles, 3 courts -> 2 sit each round.
    const players = makePlayers(14);
    const partnerships = pairFirst(5);
    const s = generateSchedule(players, 3, 8, false, 2, partnerships);
    for (const r of s.rounds) expect(r.sitOuts).toHaveLength(2);
    expect(couplesSitAsUnit(s, partnerships)).toBe(true);
    expect(couplesAlwaysIntact(s, partnerships)).toBe(true);
  });

  it('sits whole couples when there are more couples than court slots', () => {
    // 1 court (2 team slots), 8 players = 4 couples -> 2 couples play, 2 sit.
    const players = makePlayers(8);
    const partnerships = pairFirst(4);
    const s = generateSchedule(players, 1, 6, false, 2, partnerships);
    for (const r of s.rounds) {
      expect(r.courts).toHaveLength(1);
      expect(r.sitOuts).toHaveLength(4);
    }
    expect(couplesSitAsUnit(s, partnerships)).toBe(true);
    expect(couplesAlwaysIntact(s, partnerships)).toBe(true);
  });

  it('spreads couple sit-outs fairly across the session', () => {
    // 14 players, 5 couples, 2 sit each round -> couples should rotate.
    const players = makePlayers(14);
    const partnerships = pairFirst(5);
    const s = generateSchedule(players, 3, 10, false, 2, partnerships);
    const coupleSit = new Map(partnerships.map((p) => [partnerKey(p.player1Id, p.player2Id), 0]));
    for (const r of s.rounds) {
      const sitIds = new Set(r.sitOuts.map((p) => p.id));
      for (const p of partnerships) {
        if (sitIds.has(p.player1Id)) {
          const k = partnerKey(p.player1Id, p.player2Id);
          coupleSit.set(k, coupleSit.get(k)! + 1);
        }
      }
    }
    const vals = [...coupleSit.values()];
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
  });

  it('keeps couples intact through mid-session regeneration', () => {
    const players = makePlayers(12);
    const partnerships = pairFirst(3);
    const original = generateSchedule(players, 3, 8, false, 2, partnerships);
    // Remove an unpaired player (p6..p11 are singles here).
    const remaining = players.filter((p) => p.id !== 'p11');
    const active = prunePartnerships(partnerships, new Set(remaining.map((p) => p.id)));
    const regen = regenerateRemaining(remaining, 3, original.rounds, [1, 2, 3], false, 2, active);
    expect(couplesAlwaysIntact(regen, active)).toBe(true);
  });
});
