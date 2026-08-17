import type {
  Player, CourtAssignment, Round, Schedule, PairingHistory, LockedPair, Partnership,
  RoundType, RoundPlan,
} from '../types';
import { determineSitOuts } from './sitout';
import { partnerKey } from './partnerships';
import { ROUND_TYPES, courtMatchesType, roundTypeOf } from './roundTypes';
import { planAt } from './roundPlan';
import { findSpecialAssignment, partnershipFitsType } from './specialRounds';
import {
  fixtureList,
  matchesToCourts,
  nextMatches,
  partnerPlayTeams,
  recordTeamMatches,
} from './partnerPlay';
import {
  chooseShortCourtPlayers,
  effectiveCourtCount,
  findBestAssignment,
  findBestAssignmentWithLocks,
  findBestAssignmentWithPartners,
  pickShortSplit,
  planCourtSizes,
  type Assignment,
} from './assign';

export { effectiveCourtCount };

function initHistory(players: Player[]): PairingHistory {
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
  };
  for (const p of players) {
    history.partnerCounts[p.id] = {};
    history.opponentCounts[p.id] = {};
    history.sitOutCounts[p.id] = 0;
    history.gamesPlayed[p.id] = 0;
    history.shortGameCounts[p.id] = 0;
    for (const t of ROUND_TYPES) history.specialMissCounts[t][p.id] = 0;
  }
  return history;
}

function incrementBidirectional(
  counts: Record<string, Record<string, number>>,
  id1: string,
  id2: string
) {
  if (!counts[id1]) counts[id1] = {};
  if (!counts[id2]) counts[id2] = {};
  counts[id1][id2] = (counts[id1][id2] ?? 0) + 1;
  counts[id2][id1] = (counts[id2][id1] ?? 0) + 1;
}

function updateHistory(
  history: PairingHistory,
  courts: CourtAssignment[],
  sitOuts: Player[]
) {
  history.roundsRecorded = (history.roundsRecorded ?? 0) + 1;
  for (const court of courts) {
    for (const team of [court.team1, court.team2]) {
      if (team.length === 2) {
        incrementBidirectional(history.partnerCounts, team[0].id, team[1].id);
        history.lastPartneredRound[partnerKey(team[0].id, team[1].id)] = history.roundsRecorded;
      }
    }
    for (const p1 of court.team1) {
      for (const p2 of court.team2) {
        incrementBidirectional(history.opponentCounts, p1.id, p2.id);
      }
    }
    const onCourt = [...court.team1, ...court.team2];
    for (const p of onCourt) {
      history.gamesPlayed[p.id] = (history.gamesPlayed[p.id] ?? 0) + 1;
    }
    // Replayed out of the stored rounds as well as counted while building, so
    // the rotation survives a reshuffle and a reload.
    if (onCourt.length < 4) {
      for (const p of onCourt) {
        history.shortGameCounts[p.id] = (history.shortGameCounts[p.id] ?? 0) + 1;
      }
    }
  }
  for (const p of sitOuts) {
    history.sitOutCounts[p.id] = (history.sitOutCounts[p.id] ?? 0) + 1;
    if (!history.sitOutOrder.includes(p.id)) history.sitOutOrder.push(p.id);
  }
}

/**
 * Notes who did not get the round's format — they sat out, or the roster only
 * stretched to so many special courts and they got an ordinary one. Next time
 * this type comes round they are first in the queue.
 */
function updateSpecialMissCounts(
  history: PairingHistory,
  type: RoundType,
  courts: CourtAssignment[],
  sitOuts: Player[]
) {
  const misses = history.specialMissCounts[type];
  const missed = [...sitOuts];
  for (const court of courts) {
    if (courtMatchesType(court, type)) continue;
    missed.push(...court.team1, ...court.team2);
  }
  for (const p of missed) {
    misses[p.id] = (misses[p.id] ?? 0) + 1;
  }
}

// Builds a single round and folds it into `history`. Shared by all three
// schedule entry points so the per-round rules live in exactly one place.
function buildRound(
  roundNumber: number,
  players: Player[],
  effectiveCourts: number,
  history: PairingHistory,
  opts: {
    roundType: RoundType | null;
    roundLocks?: LockedPair[];
    partnerships?: Partnership[];
    previousSitOutIds?: Set<string>;
  }
): Round {
  const roundLocks = opts.roundLocks ?? [];
  const partnerships = opts.partnerships ?? [];
  const hasLocks = roundLocks.length > 0;
  // A padlock is the host pinning this round by hand, which beats a round type
  // they set once back on Setup.
  const roundType = hasLocks ? null : opts.roundType;

  // A special round type overrules Set Partners, but only for the couples it has
  // to: two men stay together on a gendered round, a man and a woman stay
  // together on a mixed one. The rest are split for this round alone.
  const byId = new Map(players.map((p) => [p.id, p]));
  const keepTogether: Partnership[] = roundType
    ? partnerships.filter((c) => {
        const p1 = byId.get(c.player1Id);
        const p2 = byId.get(c.player2Id);
        return !!p1 && !!p2 && partnershipFitsType(p1, p2, roundType);
      })
    : partnerships;
  const hasPartnerships = keepTogether.length > 0;

  // When partnerships are in play, ad-hoc locks are folded in as additional
  // "keep together" pairs (placement-agnostic) so both are honoured by one
  // solver, and locked players are eligible to sit as a unit like any couple.
  const sitOutUnits: Partnership[] = hasPartnerships
    ? [
        ...keepTogether,
        ...roundLocks.map((lp) => ({ player1Id: lp.player1Id, player2Id: lp.player2Id })),
      ]
    : [];

  // A night where everybody has a partner is a round robin between the teams,
  // and that is a different job from the one below: the fixture list decides who
  // plays, so it also decides who sits, and determineSitOuts never runs.
  //
  // It stands down for a round the host has taken charge of. A padlock pins this
  // round by hand and a special round type splits the couples it does not suit,
  // and in both cases the round is outside the sequence: it spends no fixtures
  // and the round robin picks up where it left off afterwards.
  const partnerPlay = !roundType && !hasLocks
    ? partnerPlayTeams(players, partnerships)
    : null;
  if (partnerPlay) {
    const { teams } = partnerPlay;
    const fixtures = fixtureList(teams.length);
    const capacity = Math.min(effectiveCourts, Math.floor(teams.length / 2));
    const matches = nextMatches(teams, fixtures, history, capacity);
    const courts = matchesToCourts(teams, matches);

    const playing = new Set(courts.flatMap((c) => [...c.team1, ...c.team2]).map((p) => p.id));
    const sitOuts = players.filter((p) => !playing.has(p.id));

    updateHistory(history, courts, sitOuts);
    recordTeamMatches(history, courts, teams);

    // The spare on an odd roster falls out of this naturally: they are in no
    // team, so they are never in `playing`, so they sit every round.
    return { roundNumber, courts, sitOuts };
  }

  // Locked players cannot sit out (only applies on the pure-locks path).
  const lockedIds = hasLocks && !hasPartnerships
    ? new Set(roundLocks.flatMap((lp) => [lp.player1Id, lp.player2Id]))
    : undefined;

  const sitOuts = determineSitOuts(
    players, effectiveCourts, history, lockedIds, opts.previousSitOutIds,
    hasPartnerships ? sitOutUnits : undefined,
    roundType ? history.specialMissCounts[roundType] : undefined
  );
  const sitOutIds = new Set(sitOuts.map((p) => p.id));
  const activePlayers = players.filter((p) => !sitOutIds.has(p.id));

  // A roster that will not divide by four puts a 2v1 or a game of singles on
  // the last court.
  const sizes = planCourtSizes(activePlayers.length, effectiveCourts);
  const shortSize = sizes.length > 0 && sizes[sizes.length - 1] < 4
    ? sizes[sizes.length - 1]
    : 0;
  const fullCourts = shortSize ? sizes.length - 1 : sizes.length;

  // On an ordinary round the short court is drawn first, by whoever has had
  // fewest short games, and set aside. Every solver below then sees a pool that
  // is exactly four to a court and none of them has to know about this.
  //
  // A special round does it the other way about. Which twelve of fifteen can
  // make three mixed courts is a question about who is a man and who is a woman,
  // and picking three people off the top by short-game count answers it wrongly
  // — it leaves a pool the format cannot fill and costs a mixed court. So the
  // format goes first and the short court is built from whatever it could not
  // use, which is already rotated by who is owed the format.
  const rotateShort = shortSize > 0 && !roundType;

  // The pair side of a 2v1 can be padlocked like any other pair, and the short
  // court is always the last one, so a lock naming that position is honoured by
  // seeding those two onto it rather than drawing fresh players.
  const byActiveId = new Map(activePlayers.map((p) => [p.id, p]));
  const shortLock = rotateShort
    ? roundLocks.find((lp) => lp.courtIdx === fullCourts)
    : undefined;
  const pinnedShort = shortLock
    ? ([byActiveId.get(shortLock.player1Id), byActiveId.get(shortLock.player2Id)].filter(
        Boolean
      ) as Player[])
    : [];

  const shortPlayers = rotateShort
    ? chooseShortCourtPlayers(
        activePlayers, shortSize, history, keepTogether,
        pinnedShort.length === 2 ? pinnedShort : []
      )
    : [];
  const shortIds = new Set(shortPlayers.map((p) => p.id));
  const courtPlayers = rotateShort
    ? activePlayers.filter((p) => !shortIds.has(p.id))
    : activePlayers;

  // A padlock names a court by position. The short court carries no padlock, so
  // anything pointing at it or past it has nowhere to land this round.
  const fullCourtLocks = roundLocks.filter((lp) => lp.courtIdx < fullCourts);

  let result: Assignment;
  if (roundType) {
    result = findSpecialAssignment(
      roundType, courtPlayers, sizes.length, history, keepTogether, players
    );
  } else if (hasPartnerships) {
    result = findBestAssignmentWithPartners(
      courtPlayers, fullCourts, history, sitOutUnits, players
    );
  } else if (fullCourtLocks.length > 0) {
    result = findBestAssignmentWithLocks(
      courtPlayers, fullCourts, history, fullCourtLocks, players
    );
  } else {
    result = findBestAssignment(courtPlayers, fullCourts, history, players);
  }

  if (rotateShort && shortPlayers.length === shortSize) {
    const coupleKeys = new Set(
      keepTogether.map((c) => partnerKey(c.player1Id, c.player2Id))
    );
    // A padlocked pair takes the pair side for the same reason a couple does.
    if (pinnedShort.length === 2) {
      coupleKeys.add(partnerKey(pinnedShort[0].id, pinnedShort[1].id));
    }
    result = {
      courts: [
        ...result.courts,
        pickShortSplit(shortPlayers, result.courts.length + 1, coupleKeys),
      ],
      extraSitOuts: result.extraSitOuts,
    };
  }

  const allSitOuts = [...sitOuts, ...result.extraSitOuts];
  updateHistory(history, result.courts, allSitOuts);

  if (roundType) {
    updateSpecialMissCounts(history, roundType, result.courts, allSitOuts);
  }

  return {
    roundNumber,
    courts: result.courts,
    sitOuts: allSitOuts,
    roundType: roundType ?? undefined,
  };
}

export function generateSchedule(
  players: Player[],
  numCourts: number,
  numRounds: number,
  plan: RoundPlan = [],
  partnerships: Partnership[] = []
): Schedule {
  const history = initHistory(players);
  const effectiveCourts = effectiveCourtCount(players.length, numCourts);
  const rounds: Round[] = [];
  let previousSitOutIds: Set<string> | undefined;

  for (let r = 1; r <= numRounds; r++) {
    const round = buildRound(r, players, effectiveCourts, history, {
      roundType: planAt(plan, r),
      partnerships,
      previousSitOutIds,
    });
    previousSitOutIds = new Set(round.sitOuts.map((p) => p.id));
    rounds.push(round);
  }

  return { rounds };
}

// Rebuilds only the rounds that are NOT marked complete, leaving the completed
// ones untouched. Completed rounds can be any subset (the host may play them out
// of order), so they're identified by round number rather than by position.
// The pairing history from every completed round is replayed first, so partner/
// opponent variety, the sit-out rotation and who is owed a special round type all
// carry forward instead of restarting.
// The returned schedule keeps rounds in their original numeric order.
//
// Backs both Reshuffle and the rebuild that follows a removal. `locks` and
// `brokenPairs` are keyed by position in `allRounds`, matching how the schedule
// page keys the padlocks the host has set.
export function regenerateRemaining(
  players: Player[],
  numCourts: number,
  allRounds: Round[],
  completedRoundNumbers: number[],
  plan: RoundPlan = [],
  partnerships: Partnership[] = [],
  locks: Record<number, LockedPair[]> = {},
  brokenPairs: Record<number, string[]> = {}
): Schedule {
  const completedSet = new Set(completedRoundNumbers);
  const history = initHistory(players);

  // Replay the completed rounds in numeric order. Players who have since left
  // still appear in them; their history entries are harmless because they are
  // never candidates for the rounds being rebuilt.
  const completedInOrder = allRounds.filter((r) => completedSet.has(r.roundNumber));
  // On a partner-play night the fixtures already used up are replayed too, so a
  // reshuffle of the rounds still to come carries on down the list rather than
  // starting the round robin again and repeating fixtures already played.
  const partnerPlay = partnerPlayTeams(players, partnerships);
  for (const round of completedInOrder) {
    updateHistory(history, round.courts, round.sitOuts);
    const playedAs = roundTypeOf(round);
    if (playedAs) {
      updateSpecialMissCounts(history, playedAs, round.courts, round.sitOuts);
    } else if (partnerPlay) {
      recordTeamMatches(history, round.courts, partnerPlay.teams);
    }
  }

  // Carry the sit-out rotation across the boundary from the latest completed
  // round so whoever just sat out isn't immediately picked again.
  const lastCompleted = completedInOrder[completedInOrder.length - 1];
  const remainingIds = new Set(players.map((p) => p.id));
  let previousSitOutIds = lastCompleted
    ? new Set(
        lastCompleted.sitOuts.map((p) => p.id).filter((id) => remainingIds.has(id))
      )
    : undefined;

  const effectiveCourts = effectiveCourtCount(players.length, numCourts);

  const rounds = allRounds.map((r, roundIdx) => {
    if (completedSet.has(r.roundNumber)) return r; // keep verbatim

    // Couples the host broke for this specific round are freed here only.
    const broken = new Set(brokenPairs[roundIdx] || []);
    const roundPartnerships = partnerships.filter(
      (p) => !broken.has(partnerKey(p.player1Id, p.player2Id))
    );

    const round = buildRound(r.roundNumber, players, effectiveCourts, history, {
      roundType: planAt(plan, r.roundNumber),
      roundLocks: locks[roundIdx] || [],
      partnerships: roundPartnerships,
      previousSitOutIds,
    });
    previousSitOutIds = new Set(round.sitOuts.map((p) => p.id));
    return round;
  });

  return { rounds };
}

/**
 * Adds rounds to the end of a schedule already under way.
 *
 * The rounds that were there do not move. The new ones are built as though they
 * had been asked for at the start: every partnership, opponent, sit-out and
 * short game already on the sheet is replayed into the history first, so round
 * nine carries on from round eight rather than starting the morning again.
 *
 * It is regenerateRemaining() with every existing round declared complete, which
 * is exactly what "leave those alone and plan around them" means here.
 *
 * There is nothing to reconcile about the round types any more. The plan says
 * what each round number is played as and the new rounds read the slots at
 * their own numbers, so round nine is whatever the host set round nine to —
 * ordinary, unless they have said otherwise. The old frequency machine would
 * have carried a cadence forward and could make round nine gendered on its own;
 * an explicit plan cannot, and should not.
 */
export function extendSchedule(
  players: Player[],
  numCourts: number,
  rounds: Round[],
  extraRounds: number,
  plan: RoundPlan = [],
  partnerships: Partnership[] = []
): Schedule {
  if (extraRounds < 1) return { rounds };

  const last = rounds.reduce((max, r) => Math.max(max, r.roundNumber), 0);
  const stubs: Round[] = [];
  for (let i = 1; i <= extraRounds; i++) {
    stubs.push({ roundNumber: last + i, courts: [], sitOuts: [] });
  }

  return regenerateRemaining(
    players,
    numCourts,
    [...rounds, ...stubs],
    rounds.map((r) => r.roundNumber),
    plan,
    partnerships
  );
}
