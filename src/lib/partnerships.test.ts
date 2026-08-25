import { describe, it, expect } from 'vitest';
import { generateSchedule, regenerateRemaining } from './pairing';
import {
  arePartners, partnerKey, prunePartnerships, partneredIds,
  withSubbedPairs, transferPartnership,
} from './partnerships';
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
    const s = generateSchedule(players, 3, 8, [], partnerships);
    expect(couplesAlwaysIntact(s, partnerships)).toBe(true);
  });

  it('all-couples night keeps everyone paired every round', () => {
    const players = makePlayers(12);
    const partnerships = pairFirst(6); // 6 couples, no singles
    const s = generateSchedule(players, 3, 8, [], partnerships);
    expect(couplesAlwaysIntact(s, partnerships)).toBe(true);
    for (const r of s.rounds) {
      expect(r.courts).toHaveLength(3);
      expect(r.sitOuts).toHaveLength(0);
    }
  });

  it('sits the spare on an all-couples night, every round', () => {
    // 13 players: 6 couples + 1 single, 3 courts -> exactly 1 sits each round.
    // Everybody who has a partner has one, so the night is a round robin between
    // the six teams and the fixture list decides who plays. The thirteenth is in
    // no team, so there is no round for them to be in.
    const players = makePlayers(13);
    const partnerships = pairFirst(6);
    const single = players[12];
    const s = generateSchedule(players, 3, 8, [], partnerships);
    for (const r of s.rounds) {
      expect(r.sitOuts).toHaveLength(1);
      expect(r.sitOuts[0].id).toBe(single.id);
    }
    expect(couplesAlwaysIntact(s, partnerships)).toBe(true);
  });

  /**
   * A bench one seat wide, on a night that is not all couples.
   *
   * A couple is one unit at the sit-out line, and a unit of two has never fitted
   * a bench of one. So the couple played every round of the session and the
   * unpaired players carried every sit-out between them, some of them twice
   * over. On a nine-player night that is the couple getting nine games while
   * somebody else gets seven.
   *
   * The couple takes the seat one at a time instead, and their partner plays the
   * round unlinked. Two rounds and they have each had their turn.
   */
  describe('a couple on a one-seat bench', () => {
    // 9 players: 1 couple + 7 singles, 2 courts -> exactly 1 sits each round.
    const players = makePlayers(9);
    const partnerships = pairFirst(1);

    it('gives everybody exactly one sit-out over a full cycle', () => {
      const s = generateSchedule(players, 2, 9, [], partnerships);
      const sat = new Map(players.map((p) => [p.id, 0]));
      for (const r of s.rounds) {
        expect(r.sitOuts).toHaveLength(1);
        for (const p of r.sitOuts) sat.set(p.id, sat.get(p.id)! + 1);
      }
      // Nine seats and nine players. Both halves of the couple are in here:
      // before this they took none of the nine between them.
      expect([...sat.values()]).toEqual(players.map(() => 1));
    });

    it('keeps them on the same team whenever they are both playing', () => {
      const s = generateSchedule(players, 2, 9, [], partnerships);
      for (const r of s.rounds) {
        const onCourt = r.courts.flatMap((c) => [...c.team1, ...c.team2]).map((p) => p.id);
        if (!onCourt.includes('p0') || !onCourt.includes('p1')) continue;
        const together = r.courts.some((c) =>
          [c.team1, c.team2].some(
            (t) => t.some((p) => p.id === 'p0') && t.some((p) => p.id === 'p1')
          )
        );
        expect(together, `round ${r.roundNumber}`).toBe(true);
      }
    });

    it('splits them for the bench and nowhere else', () => {
      const s = generateSchedule(players, 2, 9, [], partnerships);
      for (const r of s.rounds) {
        const sitIds = r.sitOuts.map((p) => p.id);
        // One seat, so a couple can never be sat whole. Never both, and the one
        // who is not sitting is on a court rather than lost between the two.
        expect(sitIds).not.toEqual(expect.arrayContaining(['p0', 'p1']));
        const everyone = [...r.courts.flatMap((c) => [...c.team1, ...c.team2]), ...r.sitOuts];
        expect(everyone).toHaveLength(9);
      }
    });
  });

  it('with two sit-outs, couples sit out together', () => {
    // 14 players: 5 couples + 4 singles, 3 courts -> 2 sit each round.
    const players = makePlayers(14);
    const partnerships = pairFirst(5);
    const s = generateSchedule(players, 3, 8, [], partnerships);
    for (const r of s.rounds) expect(r.sitOuts).toHaveLength(2);
    expect(couplesSitAsUnit(s, partnerships)).toBe(true);
    expect(couplesAlwaysIntact(s, partnerships)).toBe(true);
  });

  it('sits whole couples when there are more couples than court slots', () => {
    // 1 court (2 team slots), 8 players = 4 couples -> 2 couples play, 2 sit.
    const players = makePlayers(8);
    const partnerships = pairFirst(4);
    const s = generateSchedule(players, 1, 6, [], partnerships);
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
    const s = generateSchedule(players, 3, 10, [], partnerships);
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
    const original = generateSchedule(players, 3, 8, [], partnerships);
    // Remove an unpaired player (p6..p11 are singles here).
    const remaining = players.filter((p) => p.id !== 'p11');
    const active = prunePartnerships(partnerships, new Set(remaining.map((p) => p.id)));
    const regen = regenerateRemaining(remaining, 3, original.rounds, [1, 2, 3], [], active);
    expect(couplesAlwaysIntact(regen, active)).toBe(true);
  });
});

/**
 * Standing in for somebody, and taking their partner on with the seat.
 *
 * The couples in Setup are never touched by any of this. A substitute covering
 * for a twisted ankle is not a decision about who anybody's partner is, so what
 * these two build is a separate list that lasts the afternoon and no longer.
 */
describe('stand-ins', () => {
  const jeffAndAnn: Partnership = { player1Id: 'jeff', player2Id: 'ann' };
  const daveAndSue: Partnership = { player1Id: 'dave', player2Id: 'sue' };

  describe('withSubbedPairs', () => {
    it('hands back the standing couples untouched when nobody is standing in', () => {
      const base = [jeffAndAnn, daveAndSue];
      expect(withSubbedPairs(base, [])).toBe(base);
    });

    it('puts a stand-in ahead of the couples it does not touch', () => {
      const stand: Partnership = { player1Id: 'dave', player2Id: 'ann' };
      // The scheduler claims players couple by couple and skips any whose
      // members are already spoken for, so the order is the rule, not a detail.
      expect(withSubbedPairs([jeffAndAnn, daveAndSue], [stand])[0]).toEqual(stand);
    });

    it('sets aside a stand-in own couple, because the seat wins', () => {
      // Dave partners Sue every week. Today he has stepped into Jeff's place
      // beside Ann, and that is the padlock on the screen in front of the host.
      const stand: Partnership = { player1Id: 'dave', player2Id: 'ann' };
      const inForce = withSubbedPairs([jeffAndAnn, daveAndSue], [stand]);
      expect(inForce).toEqual([stand]);
    });

    it('leaves couples alone when a stand-in has nothing to do with them', () => {
      const kimAndLou: Partnership = { player1Id: 'kim', player2Id: 'lou' };
      const stand: Partnership = { player1Id: 'dave', player2Id: 'ann' };
      expect(withSubbedPairs([jeffAndAnn, kimAndLou], [stand])).toContainEqual(kimAndLou);
    });
  });

  describe('transferPartnership', () => {
    it('hands the partner to whoever takes the seat', () => {
      const subbed = transferPartnership([], [jeffAndAnn], 'jeff', 'dave');
      expect(subbed).toEqual([{ player1Id: 'dave', player2Id: 'ann' }]);
    });

    it('keeps the couple the way round it was set up', () => {
      // Ann is player2 here, so standing in for her must leave Jeff as player1.
      const subbed = transferPartnership([], [jeffAndAnn], 'ann', 'dave');
      expect(subbed).toEqual([{ player1Id: 'jeff', player2Id: 'dave' }]);
    });

    it('adds nothing when the player going off was linked to nobody', () => {
      expect(transferPartnership([], [jeffAndAnn], 'kim', 'dave')).toEqual([]);
    });

    it('carries the couple through a second substitution', () => {
      // Jeff goes off and Dave takes his place beside Ann; then Dave goes off
      // and Ed takes his. Ed is playing with Ann.
      const first = transferPartnership([], [jeffAndAnn], 'jeff', 'dave');
      const second = transferPartnership(first, [jeffAndAnn], 'dave', 'ed');
      expect(second).toEqual([{ player1Id: 'ed', player2Id: 'ann' }]);
    });

    it('never leaves one player standing in two couples', () => {
      const kimAndLou: Partnership = { player1Id: 'kim', player2Id: 'lou' };
      const first = transferPartnership([], [jeffAndAnn, kimAndLou], 'jeff', 'dave');
      // Dave, already covering for Jeff, now covers for Kim as well. He cannot
      // be locked to Ann and to Lou at once.
      const second = transferPartnership(first, [jeffAndAnn, kimAndLou], 'kim', 'dave');
      const appearances = second.filter(
        (p) => p.player1Id === 'dave' || p.player2Id === 'dave'
      );
      expect(appearances).toHaveLength(1);
      expect(second).toEqual([{ player1Id: 'dave', player2Id: 'lou' }]);
    });

    it('drops what a substitute was covering when they go off themselves', () => {
      const first = transferPartnership([], [jeffAndAnn], 'jeff', 'dave');
      // Dave goes off and Ed comes on, but Ed is not standing in for a linked
      // player this time: Dave's cover ends with him rather than being inherited
      // by nobody in particular.
      const second = transferPartnership(first, [jeffAndAnn], 'dave', 'ed');
      expect(second.some((p) => p.player1Id === 'dave' || p.player2Id === 'dave')).toBe(false);
    });

    it('keeps the scheduler pairing the substitute with the partner', () => {
      const players = makePlayers(12);
      const base = pairFirst(1); // p0 and p1
      const stand = transferPartnership([], base, 'p0', 'p11');
      const inForce = withSubbedPairs(base, stand);
      const playing = players.filter((p) => p.id !== 'p0');
      const built = generateSchedule(
        playing, 2, 6, [],
        prunePartnerships(inForce, new Set(playing.map((p) => p.id)))
      );
      expect(couplesAlwaysIntact(built, [{ player1Id: 'p11', player2Id: 'p1' }])).toBe(true);
    });
  });
});
