/**
 * Dealing the sides out, after the courts are chosen.
 *
 * The first test is the one that matters most: this returns the same games,
 * some of them turned round, and nothing else. That is the whole argument for
 * doing it here rather than as a term in the cost function — serve fairness
 * cannot be bought with a worse match, because there is no match this could
 * change.
 */
import { describe, it, expect } from 'vitest';
import { dealSides } from './sides';
import { generateSchedule, regenerateRemaining } from './pairing';
import type { CourtAssignment, PairingHistory, Partnership, Player, Round, Schedule } from '../types';

function player(id: string, rating = 3.5): Player {
  return { id, name: id, rating, gender: 'F', rosterIds: ['g1'] };
}

function court(courtNumber: number, left: string[], right: string[]): CourtAssignment {
  return {
    courtNumber,
    team1: left.map((id) => player(id)),
    team2: right.map((id) => player(id)),
    ratingDiff: 0,
  };
}

function emptyHistory(): PairingHistory {
  return {
    partnerCounts: {},
    opponentCounts: {},
    sitOutCounts: {},
    sitOutOrder: [],
    roundsRecorded: 0,
    lastPartneredRound: {},
    gamesPlayed: {},
    shortGameCounts: {},
    courtCounts: {},
    specialMissCounts: { gendered: {}, mixed: {}, skill: {} },
    teamMatchCounts: {},
    serveCounts: {},
  };
}

/** `serveCounts` as if these players had already served that many games. */
function history(serveCounts: Record<string, number>): PairingHistory {
  return { ...emptyHistory(), serveCounts };
}

const ids = (team: Player[]) => team.map((p) => p.id).join('');
const sides = (c: CourtAssignment) => `${ids(c.team1)}v${ids(c.team2)}`;

describe('dealSides', () => {
  it('returns the same games, some of them turned round, and nothing else', () => {
    // The invariant the whole design rests on. Whatever this does to a court's
    // sides, the four people on it, its number and its score are untouched.
    const courts = [
      { ...court(1, ['a', 'b'], ['c', 'd']), score: { team1: 11, team2: 7 } },
      court(2, ['e', 'f'], ['g', 'h']),
    ];
    const dealt = dealSides(courts, history({ a: 5, b: 5, e: 5, f: 5 }));
    expect(dealt.map((c) => c.courtNumber)).toEqual([1, 2]);
    expect(dealt.map((c) => [...c.team1, ...c.team2].map((p) => p.id).sort().join(''))).toEqual([
      'abcd',
      'efgh',
    ]);
    expect(dealt[0].score).toEqual({ team1: 11, team2: 7 });
    // Turned, both of them, because the left had served and the right had not.
    expect(dealt.map(sides)).toEqual(['cdvab', 'ghvef']);
    // And the input was not touched.
    expect(courts.map(sides)).toEqual(['abvcd', 'efvgh']);
  });

  it('turns a court whose right-hand team has served less', () => {
    const [dealt] = dealSides([court(1, ['a', 'b'], ['c', 'd'])], history({ a: 2, b: 2, c: 1, d: 1 }));
    expect(sides(dealt)).toBe('cdvab');
  });

  it('leaves a court whose left-hand team has served less', () => {
    const [dealt] = dealSides([court(1, ['a', 'b'], ['c', 'd'])], history({ a: 1, b: 1, c: 2, d: 2 }));
    expect(sides(dealt)).toBe('abvcd');
  });

  it('counts a team by both its players together', () => {
    // 0 + 3 on the left against 1 + 1 on the right: the left has served more,
    // though its first player has served least of anybody.
    const [dealt] = dealSides([court(1, ['a', 'b'], ['c', 'd'])], history({ a: 0, b: 3, c: 1, d: 1 }));
    expect(sides(dealt)).toBe('cdvab');
  });

  it('settles a tie by the coin, so a first round comes out both ways', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200 && seen.size < 2; i++) {
      seen.add(sides(dealSides([court(1, ['a', 'b'], ['c', 'd'])], emptyHistory())[0]));
    }
    // 200 fair coins all landing the same way is one chance in 2^199.
    expect([...seen].sort()).toEqual(['abvcd', 'cdvab']);
  });

  it('deals a game of singles like any other court', () => {
    const [dealt] = dealSides([court(1, ['a'], ['b'])], history({ a: 3, b: 0 }));
    expect(sides(dealt)).toBe('bva');
  });

  it('never turns a 2v1, however much the single is owed', () => {
    const [dealt] = dealSides([court(1, ['a', 'b'], ['c'])], history({ a: 9, b: 9, c: 0 }));
    expect(sides(dealt)).toBe('abvc');
  });

  it('leaves a padlocked round exactly as the host arranged it', () => {
    const courts = [court(1, ['a', 'b'], ['c', 'd'])];
    const dealt = dealSides(courts, history({ a: 9, b: 9 }), { pinned: true });
    expect(dealt).toBe(courts);
  });
});

/** Everybody paired off, in the order given. */
function pairOff(players: Player[]): Partnership[] {
  const out: Partnership[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    out.push({ player1Id: players[i].id, player2Id: players[i + 1].id });
  }
  return out;
}

function roster(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => player(`p${i}`, 3 + (i % 5) * 0.25));
}

/** Per player: games started on the serving side, and games played. */
function serveTally(schedule: Schedule) {
  const out: Record<string, { served: number; played: number }> = {};
  for (const round of schedule.rounds) {
    for (const c of round.courts) {
      for (const p of c.team1) {
        (out[p.id] ??= { served: 0, played: 0 }).served++;
        out[p.id].played++;
      }
      for (const p of c.team2) {
        (out[p.id] ??= { served: 0, played: 0 }).played++;
      }
    }
  }
  return out;
}

describe('serving side across a schedule', () => {
  // The night that was reported: six pairs, eight rounds, one pair serving
  // every round and another receiving every round.
  it('spreads the serve on a night of partner play', () => {
    // Measured over 300 schedules on 2026-09-05: every team served 3, 4 or 5
    // of its 8 games, never fewer or more. Bound set with a game of headroom
    // each side. Before dealSides the first-sorted pair served 8 of 8.
    const players = roster(12);
    for (let i = 0; i < 6; i++) {
      const tally = serveTally(generateSchedule(players, 3, 8, [], pairOff(players)));
      for (const [id, { served, played }] of Object.entries(tally)) {
        expect(played, id).toBe(8);
        expect(served, id).toBeGreaterThanOrEqual(2);
        expect(served, id).toBeLessThanOrEqual(6);
      }
    }
  }, 30000);

  it('spreads the serve when couples face singles', () => {
    // A couple facing two singles used to take the left every time. Measured
    // over 300 schedules on 2026-09-05: served/played ran from 2/8 to 6/8,
    // with the ends rare (14 of 3600 player-schedules). Bound is looser than
    // the partner-play one because two singles' counts can pull against each
    // other; it rules out the all-but-one case that was complained about.
    const players = roster(12);
    for (let i = 0; i < 6; i++) {
      const tally = serveTally(generateSchedule(players, 3, 8, [], pairOff(players.slice(0, 4))));
      for (const [id, { served, played }] of Object.entries(tally)) {
        expect(played, id).toBe(8);
        expect(served, id).toBeGreaterThanOrEqual(1);
        expect(served, id).toBeLessThanOrEqual(7);
      }
    }
  }, 30000);

  it('replays who has been serving through a reshuffle', () => {
    // Two pairs on one court. Four completed rounds, all with the same pair
    // serving; the fifth, rebuilt, must put the other pair on the left. Nothing
    // random about it: the deficit is four games.
    const players = roster(4);
    const partnerships = pairOff(players);
    const served = (roundNumber: number): Round => ({
      roundNumber,
      courts: [
        {
          courtNumber: 1,
          team1: [players[0], players[1]],
          team2: [players[2], players[3]],
          ratingDiff: 0,
        },
      ],
      sitOuts: [],
    });
    const rounds = [served(1), served(2), served(3), served(4), { roundNumber: 5, courts: [], sitOuts: [] }];
    const rebuilt = regenerateRemaining(players, 1, rounds, [1, 2, 3, 4], [], partnerships);
    expect(rebuilt.rounds[4].courts).toHaveLength(1);
    expect(ids(rebuilt.rounds[4].courts[0].team1)).toBe('p2p3');
  });
});
