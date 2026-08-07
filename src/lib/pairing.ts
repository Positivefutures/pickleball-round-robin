import type {
  Player, CourtAssignment, Round, Schedule, PairingHistory, LockedPair, Partnership,
  RoundType, SpecialGameTypes,
} from '../types';
import { determineSitOuts } from './sitout';
import { partnerKey } from './partnerships';
import { ROUND_TYPES, DEFAULT_SPECIAL_TYPES, planRoundTypes, roundTypeOf } from './roundTypes';
import { findSpecialAssignment, partnershipFitsType } from './specialRounds';
import {
  effectiveCourtCount,
  findBestAssignment,
  findBestAssignmentWithLocks,
  findBestAssignmentWithPartners,
  type Assignment,
} from './assign';

export { effectiveCourtCount };

function initHistory(players: Player[]): PairingHistory {
  const history: PairingHistory = {
    partnerCounts: {},
    opponentCounts: {},
    sitOutCounts: {},
    gamesPlayed: {},
    specialMissCounts: { gendered: {}, mixed: {}, skill: {} },
  };
  for (const p of players) {
    history.partnerCounts[p.id] = {};
    history.opponentCounts[p.id] = {};
    history.sitOutCounts[p.id] = 0;
    history.gamesPlayed[p.id] = 0;
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
  for (const court of courts) {
    for (const team of [court.team1, court.team2]) {
      if (team.length === 2) {
        incrementBidirectional(history.partnerCounts, team[0].id, team[1].id);
      }
    }
    for (const p1 of court.team1) {
      for (const p2 of court.team2) {
        incrementBidirectional(history.opponentCounts, p1.id, p2.id);
      }
    }
    for (const p of [...court.team1, ...court.team2]) {
      history.gamesPlayed[p.id] = (history.gamesPlayed[p.id] ?? 0) + 1;
    }
  }
  for (const p of sitOuts) {
    history.sitOutCounts[p.id] = (history.sitOutCounts[p.id] ?? 0) + 1;
  }
}

/** Did this court actually get played in the round's format? */
function isCourtOfType(court: CourtAssignment, type: RoundType): boolean {
  const teams = [court.team1, court.team2];
  switch (type) {
    case 'gendered':
      return new Set([...court.team1, ...court.team2].map((p) => p.gender)).size === 1;
    case 'mixed':
      return teams.every((t) => t.length === 2 && t[0].gender !== t[1].gender);
    case 'skill':
      // Every court in a skill round is a rating band by construction.
      return true;
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
    if (isCourtOfType(court, type)) continue;
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
  // A padlock is the host pinning this round by hand, which beats a game type
  // they set once back on Setup.
  const roundType = hasLocks ? null : opts.roundType;

  // A special game type overrules Set Partners, but only for the couples it has
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

  let result: Assignment;
  if (roundType) {
    result = findSpecialAssignment(
      roundType, activePlayers, effectiveCourts, history, keepTogether, players
    );
  } else if (hasPartnerships) {
    result = findBestAssignmentWithPartners(
      activePlayers, effectiveCourts, history, sitOutUnits, players
    );
  } else if (hasLocks) {
    result = findBestAssignmentWithLocks(
      activePlayers, effectiveCourts, history, roundLocks, players
    );
  } else {
    result = findBestAssignment(activePlayers, effectiveCourts, history, players);
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
  specialTypes: SpecialGameTypes = DEFAULT_SPECIAL_TYPES,
  partnerships: Partnership[] = []
): Schedule {
  const history = initHistory(players);
  const effectiveCourts = effectiveCourtCount(players.length, numCourts);
  const plan = planRoundTypes(specialTypes, numRounds);
  const rounds: Round[] = [];
  let previousSitOutIds: Set<string> | undefined;

  for (let r = 1; r <= numRounds; r++) {
    const round = buildRound(r, players, effectiveCourts, history, {
      roundType: plan[r - 1],
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
// opponent variety, the sit-out rotation and who is owed a special game type all
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
  specialTypes: SpecialGameTypes = DEFAULT_SPECIAL_TYPES,
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
  for (const round of completedInOrder) {
    updateHistory(history, round.courts, round.sitOuts);
    const playedAs = roundTypeOf(round);
    if (playedAs) {
      updateSpecialMissCounts(history, playedAs, round.courts, round.sitOuts);
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
  const plan = planRoundTypes(specialTypes, allRounds.length);

  const rounds = allRounds.map((r, roundIdx) => {
    if (completedSet.has(r.roundNumber)) return r; // keep verbatim

    // Couples the host broke for this specific round are freed here only.
    const broken = new Set(brokenPairs[roundIdx] || []);
    const roundPartnerships = partnerships.filter(
      (p) => !broken.has(partnerKey(p.player1Id, p.player2Id))
    );

    const round = buildRound(r.roundNumber, players, effectiveCourts, history, {
      roundType: plan[r.roundNumber - 1] ?? null,
      roundLocks: locks[roundIdx] || [],
      partnerships: roundPartnerships,
      previousSitOutIds,
    });
    previousSitOutIds = new Set(round.sitOuts.map((p) => p.id));
    return round;
  });

  return { rounds };
}
