import { describe, it, expect } from 'vitest';
import {
  extendSchedule, generateSchedule, regenerateRemaining, effectiveCourtCount,
} from './pairing';
import { addToRemainingRounds, determineSitOuts } from './sitout';
import { partnerKey } from './partnerships';
import type { PairingHistory, Player, Schedule } from '../types';

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
  it('counts the courts a game can be put on, short ones included', () => {
    expect(effectiveCourtCount(12, 3)).toBe(3);
    expect(effectiveCourtCount(11, 3)).toBe(3); // two full and a 2v1
    expect(effectiveCourtCount(10, 3)).toBe(3); // two full and a game of singles
    expect(effectiveCourtCount(9, 3)).toBe(2); // the ninth would stand alone
    expect(effectiveCourtCount(7, 3)).toBe(2);
    expect(effectiveCourtCount(3, 3)).toBe(1);
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

  // The 0.5 gap is a target the solver trades away deliberately: partner
  // variety outranks it now, so a court goes past 0.5 when staying under it
  // would mean repeating a partnership. Measured over 300 schedules (7200
  // courts): 2.3% of courts land past 0.5, 0.4% past 0.75, the worst single
  // court was 1.25, and the worst schedule still kept 87.5% of its courts on
  // target. Both halves are checked, because a bare max would still pass if
  // every court drifted wide.
  it('keeps courts near the 0.5 rating target, trading it only for variety', () => {
    const s = generateSchedule(makePlayers(12), 3, 8);
    const diffs = s.rounds.flatMap((r) => r.courts.map((c) => c.ratingDiff));
    const withinCap = diffs.filter((d) => d <= 0.5 + 1e-9).length;

    expect(Math.max(...diffs)).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(withinCap / diffs.length).toBeGreaterThanOrEqual(0.8);
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
      // 11 players over 3 courts: two full and a 2v1, rather than the two courts
      // and three people on the bench this used to give.
      expect(r.courts).toHaveLength(3);
      expect(r.courts.map((c) => c.team1.length + c.team2.length)).toEqual([4, 4, 3]);
      expect(r.sitOuts).toHaveLength(0);
    }
    const present = tail.some((r) =>
      [...r.courts.flatMap((c) => [...c.team1, ...c.team2]), ...r.sitOuts].some((p) => p.id === removed.id)
    );
    expect(present).toBe(false); // removed player absent from rebuilt rounds
  });

  it('distributes sit-outs fairly across rebuilt rounds', () => {
    // Two courts, not three: eleven players over three courts no longer sits
    // anybody down, it plays a 2v1, and there would be no rotation to measure.
    const removed = players[7];
    const remaining = players.filter((p) => p.id !== removed.id);
    const regen = regenerateRemaining(remaining, 2, original.rounds, [1, 2, 3, 4]);
    const spread = sitOutSpread(regen.rounds.slice(4), remaining.map((p) => p.id));
    expect(spread).toBeLessThanOrEqual(1);
  });

  // Measured over 300 runs after the variety overhaul: no pair partnered more
  // than twice, and a quarter of runs had nobody partner twice at all. The
  // bound used to be 3 because the old solver reached it one run in twenty;
  // the fresh-team matching took that tail away, so 2 is now safe to assert
  // and 3 would hide a regression.
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
      expect(r.courts).toHaveLength(3);
      expect(r.sitOuts).toHaveLength(0);
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
      players, 3, original.rounds, [1, 2, 3, 4], [], [],
      { 4: [{ player1Id: a.id, player2Id: b.id, courtIdx: 0, team: 'team1' }] }
    );
    const team1 = regen.rounds[4].courts[0].team1.map((p) => p.id);
    expect(team1).toContain(a.id);
    expect(team1).toContain(b.id);
  });

  // Breaking a couple lifts the "keep together" constraint for that round; it
  // does not forbid the pairing, so the solver may still put them together by
  // chance. The guarantees worth asserting are that an intact couple is ALWAYS
  // together, and that a break reaches one round and no other.
  describe('a couple broken for a single round', () => {
    const [a, b] = players;
    const couple = [{ player1Id: a.id, player2Id: b.id }];

    const together = (s: Schedule, roundIdx: number) =>
      s.rounds[roundIdx].courts.some((c) =>
        [c.team1, c.team2].some(
          (t) => t.some((p) => p.id === a.id) && t.some((p) => p.id === b.id)
        )
      );

    const rebuild = (brokenPairs: Record<number, string[]> = {}) =>
      regenerateRemaining(
        players, 3, original.rounds, [1, 2, 3, 4], [], couple, {}, brokenPairs
      );

    it('keeps an unbroken couple together in every rebuilt round', () => {
      const regen = rebuild();
      for (const idx of [4, 5, 6, 7]) expect(together(regen, idx)).toBe(true);
    });

    it('leaves the couple intact in the rounds either side of the break', () => {
      const regen = rebuild({ 5: [partnerKey(a.id, b.id)] });
      expect(together(regen, 4)).toBe(true);
      expect(together(regen, 6)).toBe(true);
    });

    it('lets the solver split them in the round that was broken', () => {
      // Freeing the couple does not forbid the pairing, so this is the one
      // assertion here that cannot be deterministic. What varies is the base
      // schedule, not the rebuild: for a given history the outcome is
      // effectively fixed, and for roughly one base in twenty the solver still
      // prefers pairing these two once freed. Retrying the same base is
      // therefore useless — several different bases is what makes a false
      // failure vanishing, while an ignored brokenPairs argument would still be
      // caught, since it would keep them together in every one.
      const split = Array.from({ length: 6 }, () => {
        const base = generateSchedule(players, 3, 8);
        const regen = regenerateRemaining(
          players, 3, base.rounds, [1, 2, 3, 4], [], couple, {},
          { 4: [partnerKey(a.id, b.id)] }
        );
        return !together(regen, 4);
      });
      expect(split.some(Boolean)).toBe(true);
    });
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
    const withLatecomer = addToRemainingRounds(original.rounds, completed, latecomer);
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
    const next = addToRemainingRounds(original.rounds, [1, 2], latecomer);

    expect(next[0].sitOuts.map((p) => p.id)).not.toContain(latecomer.id);
    for (const r of next.slice(2)) {
      expect(r.sitOuts.map((p) => p.id)).toContain(latecomer.id);
    }
  });
});

describe('extendSchedule', () => {
  const fingerprint = (r: Schedule['rounds'][number]) =>
    JSON.stringify([
      r.roundNumber,
      r.courts.map((c) => [c.courtNumber, c.team1.map((p) => p.id), c.team2.map((p) => p.id)]),
      r.sitOuts.map((p) => p.id),
    ]);

  it('adds rounds on the end and leaves the ones already there alone', () => {
    const nine = makePlayers(9);
    const before = generateSchedule(nine, 2, 8);
    const kept = before.rounds.map(fingerprint);

    const after = extendSchedule(nine, 2, before.rounds, 2);

    expect(after.rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(after.rounds.slice(0, 8).map(fingerprint)).toEqual(kept);
    for (const r of after.rounds.slice(8)) {
      expect(r.courts.length).toBeGreaterThan(0);
    }
  });

  /**
   * Every assertion below runs over a fresh base schedule each time, because a
   * schedule is built with a shuffle in it and one lucky eight-round start would
   * prove nothing. The bounds are measured, not hoped for: after the variety
   * overhaul, three hundred runs of the level-rated extension reused zero
   * pairings every single time, while bolting two independently generated
   * rounds on the end drifted to a spread of 2 and 4 repeats.
   */
  const RUNS = 15;

  it('keeps the sit-out rotation going instead of starting it over', () => {
    for (let i = 0; i < RUNS; i++) {
      const nine = makePlayers(9);
      const ids = nine.map((p) => p.id);
      const eight = generateSchedule(nine, 2, 8);
      const ten = extendSchedule(nine, 2, eight.rounds, 2);

      // Nine over two courts sits one player a round. Ten rounds shared out
      // evenly is a spread of one, and the two new rounds have to know who has
      // already sat to manage it.
      expect(sitOutSpread(ten.rounds, ids)).toBeLessThanOrEqual(1);
    }
  });

  /** Partnerships in the added rounds that had already been played. */
  function reusedPairs(before: Schedule['rounds'], added: Schedule['rounds']): number {
    const key = (t: Player[]) => [t[0].id, t[1].id].sort().join('+');
    const seen = new Set<string>();
    for (const r of before) {
      for (const c of r.courts) for (const t of [c.team1, c.team2]) {
        if (t.length === 2) seen.add(key(t));
      }
    }
    let n = 0;
    for (const r of added) {
      for (const c of r.courts) for (const t of [c.team1, c.team2]) {
        if (t.length === 2 && seen.has(key(t))) n++;
      }
    }
    return n;
  }

  it('does not play a pairing again when it has another to choose', () => {
    // Four players and one court: round two can pair them three ways, and one
    // of those is what round one already did. Knowing that is the whole point.
    for (let i = 0; i < RUNS; i++) {
      const four = makePlayers(4);
      const one = generateSchedule(four, 1, 1);
      const two = extendSchedule(four, 1, one.rounds, 1);

      expect(reusedPairs(one.rounds, two.rounds.slice(1))).toBe(0);
    }
  });

  it('reaches for fresh partners in the rounds it adds', () => {
    // Twelve over three courts: two rounds use twelve of the sixty-six pairings
    // available, so an extension that has replayed them has no need to repeat.
    //
    // Everybody is rated the same on purpose. This is a question about partner
    // history, and a spread of ratings would have the balancer answering it
    // instead. Level, three hundred runs of the fresh-team matcher reused zero
    // pairings every time; the bound stays at one to give the random tie-breaks
    // room, and rounds generated in ignorance of the first two still average
    // 2.2 reused and reach 6, which is what this is here to catch.
    const level = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`, name: `P${i}`, rating: 4,
      gender: (i % 2 === 0 ? 'M' : 'F') as Player['gender'], rosterIds: ['r1'],
    }));

    for (let i = 0; i < RUNS; i++) {
      const two = generateSchedule(level, 3, 2);
      const four = extendSchedule(level, 3, two.rounds, 2);

      expect(reusedPairs(two.rounds, four.rounds.slice(2))).toBeLessThanOrEqual(1);
    }
  });

  it('never picks the player who just sat out to sit out again', () => {
    for (let i = 0; i < RUNS; i++) {
      const nine = makePlayers(9);
      const eight = generateSchedule(nine, 2, 8);
      const ten = extendSchedule(nine, 2, eight.rounds, 2);

      const lastOld = eight.rounds[7].sitOuts.map((p) => p.id);
      for (const p of ten.rounds[8].sitOuts) expect(lastOld).not.toContain(p.id);
    }
  });

  it('hands the schedule straight back when asked for no rounds', () => {
    const nine = makePlayers(9);
    const before = generateSchedule(nine, 2, 8);
    expect(extendSchedule(nine, 2, before.rounds, 0).rounds).toBe(before.rounds);
  });
});

describe('sit-out fairness', () => {
  function emptyHistory(players: Player[]): PairingHistory {
    const history: PairingHistory = {
      partnerCounts: {},
      opponentCounts: {},
      sitOutCounts: {},
      sitOutOrder: [],
      roundsRecorded: 0,
      lastPartneredRound: {},
      gamesPlayed: {},
      shortGameCounts: {},
      specialMissCounts: { gendered: {}, mixed: {}, skill: {} },
      teamMatchCounts: {},
      serveCounts: {},
    };
    for (const p of players) {
      history.gamesPlayed[p.id] = 0;
      history.sitOutCounts[p.id] = 0;
    }
    return history;
  }

  // `Math.random() - 0.5` inside a sort comparator is a biased shuffle, and it
  // made whoever was first in the roster sit out round 1 nearly three times as
  // often as anyone else. The fix draws one random key per player before the
  // sort. Uniform selection over 2000 draws gives a chi-square around 12 on
  // 12 degrees of freedom and stays under 40 all but one run in ten thousand;
  // the biased comparator measured well over 200 here.
  it('gives the first sit-out to anyone, not the top of the roster', () => {
    const players = makePlayers(13);
    const RUNS = 2000;
    const counts = new Map(players.map((p) => [p.id, 0]));
    for (let i = 0; i < RUNS; i++) {
      const sitters = determineSitOuts(players, 3, emptyHistory(players));
      expect(sitters).toHaveLength(1);
      counts.set(sitters[0].id, (counts.get(sitters[0].id) ?? 0) + 1);
    }
    const expected = RUNS / players.length;
    let chi = 0;
    for (const c of counts.values()) chi += ((c - expected) ** 2) / expected;
    expect(chi).toBeLessThan(40);
  });

  // Jeff's rule: if Joe sat round 1 and Jill round 2, then when the bench
  // comes back around it is Joe again, then Jill. The order the first cycle
  // happened to take is the order every later cycle takes. Deterministic, not
  // probabilistic — measured at 100% over 20 runs before it was asserted.
  it('repeats the sit-out cycle in the order the first cycle set', () => {
    const players = makePlayers(13); // one sitter a round, cycle of 13
    const s = generateSchedule(players, 3, 26);
    const seq = s.rounds.map((r) => r.sitOuts.map((p) => p.id).sort().join('+'));
    expect(seq.slice(13)).toEqual(seq.slice(0, 13));
  }, 20000);

  it('repeats the cycle for pairs of sitters too', () => {
    const players = makePlayers(14); // two sitters a round, cycle of 7
    const s = generateSchedule(players, 3, 14);
    const seq = s.rounds.map((r) => r.sitOuts.map((p) => p.id).sort().join('+'));
    expect(seq.slice(7)).toEqual(seq.slice(0, 7));
  }, 20000);
});

describe('partner variety', () => {
  /** How many times any team was a repeat of an earlier partnership. */
  function repeatEvents(s: Schedule): number {
    const m = new Map<string, number>();
    let events = 0;
    for (const r of s.rounds) {
      for (const c of r.courts) {
        for (const t of [c.team1, c.team2]) {
          if (t.length !== 2) continue;
          const k = [t[0].id, t[1].id].sort().join('+');
          if ((m.get(k) ?? 0) > 0) events++;
          m.set(k, (m.get(k) ?? 0) + 1);
        }
      }
    }
    return events;
  }

  /** Teams that were also a team in the round directly before. */
  function backToBackRepeats(s: Schedule): number {
    const lastRound = new Map<string, number>();
    let hits = 0;
    for (const r of s.rounds) {
      for (const c of r.courts) {
        for (const t of [c.team1, c.team2]) {
          if (t.length !== 2) continue;
          const k = [t[0].id, t[1].id].sort().join('+');
          if (lastRound.get(k) === r.roundNumber - 1) hits++;
          lastRound.set(k, r.roundNumber);
        }
      }
    }
    return hits;
  }

  // Twelve players over eight rounds use 48 of the 66 pairings available, so
  // repeating one is a choice, not a necessity. Everybody is rated the same so
  // the balancer cannot answer a partner-history question. Measured over 200
  // schedules: 97.5% had no repeat at all and none had more than one pair
  // repeat once, so a budget of two events across five runs has room to spare
  // while the old solver, which averaged one or two repeats a schedule here,
  // blows straight through it.
  it('does not repeat a partnership while fresh ones remain', () => {
    const level = makePlayers(12).map((p) => ({ ...p, rating: 3.5 }));
    let events = 0;
    for (let i = 0; i < 5; i++) {
      events += repeatEvents(generateSchedule(level, 3, 8));
    }
    expect(events).toBeLessThanOrEqual(2);
  }, 20000);

  // The Mike-and-Jay bug: the same two people teamed up in rounds 8 and 9.
  // Cumulative counts cannot see it — rounds 8 and 9 cost what rounds 1 and 9
  // cost — so the scorer carries lastPartneredRound and fines the recent
  // repeat. Fourteen rounds of twelve players is the regime that forces
  // repeats (84 teams, 66 pairings), which makes it the regime where the
  // recency memory earns its keep: with it, sixty measured schedules had zero
  // back-to-back repeats; with the memory deleted, three in ten schedules had
  // one or more. One across ten schedules leaves the random tie-breaks room.
  it('never hands you the same partner two rounds running', () => {
    let hits = 0;
    for (let i = 0; i < 10; i++) {
      hits += backToBackRepeats(generateSchedule(makePlayers(12), 3, 14));
    }
    expect(hits).toBeLessThanOrEqual(1);
  }, 60000);
});

/**
 * Courts are not interchangeable at a real venue — wind, sun, the surface, how
 * far it is from the bathroom — so a pair parked on the worst one all night has
 * had a worse evening than everybody else, however fair the pairings were.
 *
 * Nothing used to decide this. `courtNumber` was stamped as whatever index a
 * solver happened to build a court at, so who played where fell out of the
 * order groups came back in. Measured over 25 twelve-round schedules per
 * config: with set partners on for everybody, 50 of 300 player-schedules never
 * left one court at all and the worst player had all 12 games in one place.
 * Ordinary sessions never stuck anybody outright but the worst player still had
 * 10 of 12 games on one court, and 11 of 12 on a gendered/skill night.
 *
 * With the courts dealt out after the groups are chosen: nobody stuck in any
 * config, worst spread 0 with set partners and 4 to 6 everywhere else. The
 * bounds below sit above the measured worst with room for the random
 * tie-breaks under them.
 */
describe('court variety', () => {
  /** Per player: most games on one court minus fewest, and whether they ever moved. */
  function courtSpread(s: Schedule): { worst: number; stuck: number } {
    const seen = new Map<string, Map<number, number>>();
    const used = new Set<number>();
    for (const r of s.rounds) {
      r.courts.forEach((c, idx) => {
        used.add(idx);
        for (const p of [...c.team1, ...c.team2]) {
          if (!seen.has(p.id)) seen.set(p.id, new Map());
          const mine = seen.get(p.id)!;
          mine.set(idx, (mine.get(idx) ?? 0) + 1);
        }
      });
    }
    let worst = 0;
    let stuck = 0;
    for (const counts of seen.values()) {
      const games = [...counts.values()].reduce((a, b) => a + b, 0);
      const per = [...used].map((idx) => counts.get(idx) ?? 0);
      worst = Math.max(worst, Math.max(...per) - Math.min(...per));
      if (counts.size === 1 && games > 1) stuck += 1;
    }
    return { worst, stuck };
  }

  it('moves people around the courts on an ordinary night', () => {
    // Measured worst spread 4 over 25 schedules; 6 leaves the tie-breaks room.
    for (let i = 0; i < 5; i++) {
      const { worst, stuck } = courtSpread(generateSchedule(makePlayers(12), 3, 12));
      expect(stuck).toBe(0);
      expect(worst).toBeLessThanOrEqual(6);
    }
  }, 30000);

  it('moves a fixed pair around the courts too', () => {
    // The night this came from. A fully paired roster takes the partner-play
    // path, which reads a fixture list in the same order every round and never
    // calls the scorer — so a cost-function term would not have touched it.
    const players = makePlayers(12);
    const partnerships = Array.from({ length: 6 }, (_, i) => ({
      player1Id: `p${i * 2}`,
      player2Id: `p${i * 2 + 1}`,
    }));
    for (let i = 0; i < 5; i++) {
      const { worst, stuck } = courtSpread(
        generateSchedule(players, 3, 12, [], partnerships)
      );
      expect(stuck).toBe(0);
      // Twelve rounds over three courts divides exactly, and with the pairs
      // fixed there is nothing to stop it landing on 4/4/4.
      expect(worst).toBeLessThanOrEqual(2);
    }
  }, 30000);

  it('replays court history out of the saved rounds', () => {
    // Same rule as every other count here: a reshuffle of the back half has to
    // know where people have already played, or it starts the problem again.
    const players = makePlayers(12);
    const first = generateSchedule(players, 3, 12);
    const completed = [1, 2, 3, 4, 5, 6];
    const redone = regenerateRemaining(players, 3, first.rounds, completed);

    const { worst, stuck } = courtSpread(redone);
    expect(stuck).toBe(0);
    expect(worst).toBeLessThanOrEqual(6);
  }, 30000);
});
