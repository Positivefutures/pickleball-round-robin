import type { Player, CourtAssignment, Round, Schedule, PairingHistory, LockedPair } from '../types';
import { fisherYatesShuffle, sumRatings } from '../utils/helpers';
import { scoreAssignment } from './scoring';
import { determineSitOuts } from './sitout';

function initHistory(players: Player[]): PairingHistory {
  const history: PairingHistory = {
    partnerCounts: {},
    opponentCounts: {},
    sitOutCounts: {},
    gamesPlayed: {},
    genderedMixedCounts: {},
  };
  for (const p of players) {
    history.partnerCounts[p.id] = {};
    history.opponentCounts[p.id] = {};
    history.sitOutCounts[p.id] = 0;
    history.gamesPlayed[p.id] = 0;
    history.genderedMixedCounts[p.id] = 0;
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

function getInteractionCount(
  history: PairingHistory,
  id1: string,
  id2: string
): number {
  return (history.partnerCounts[id1]?.[id2] ?? 0)
    + (history.opponentCounts[id1]?.[id2] ?? 0);
}

function pickBestSplit(
  four: Player[],
  history: PairingHistory,
  courtNumber: number
): CourtAssignment {
  const splits: [Player[], Player[]][] = [
    [[four[0], four[1]], [four[2], four[3]]],
    [[four[0], four[2]], [four[1], four[3]]],
    [[four[0], four[3]], [four[1], four[2]]],
  ];

  let bestSplit = splits[0];
  let bestScore = Infinity;

  const MAX_DIFF = 0.5;

  for (const [team1, team2] of splits) {
    const ratingDiff = Math.abs(sumRatings(team1) - sumRatings(team2));

    // Hard penalty if this split exceeds the max allowed rating difference
    const capPenalty = ratingDiff > MAX_DIFF ? 200 * (ratingDiff - MAX_DIFF) : 0;

    let partnerPenalty = 0;
    partnerPenalty += Math.pow(history.partnerCounts[team1[0].id]?.[team1[1].id] ?? 0, 1.5);
    partnerPenalty += Math.pow(history.partnerCounts[team2[0].id]?.[team2[1].id] ?? 0, 1.5);

    let opponentPenalty = 0;
    for (const p1 of team1) {
      for (const p2 of team2) {
        opponentPenalty += Math.pow(history.opponentCounts[p1.id]?.[p2.id] ?? 0, 1.5);
      }
    }

    // Reward splits where partners are new to each other
    let splitNovelty = 0;
    if (getInteractionCount(history, team1[0].id, team1[1].id) === 0) splitNovelty += 5;
    if (getInteractionCount(history, team2[0].id, team2[1].id) === 0) splitNovelty += 5;

    const score = capPenalty + ratingDiff * 3 + partnerPenalty * 8 + opponentPenalty * 6 - splitNovelty;
    if (score < bestScore) {
      bestScore = score;
      bestSplit = [team1, team2];
    }
  }

  const [team1, team2] = bestSplit;
  return {
    courtNumber,
    team1,
    team2,
    ratingDiff: Math.abs(sumRatings(team1) - sumRatings(team2)),
  };
}

// Build courts by greedily targeting players who haven't met yet.
// Returns groups of 4 players for each court, plus extras who sit out.
function buildGreedyCourts(
  activePlayers: Player[],
  effectiveCourts: number,
  history: PairingHistory
): { groups: Player[][]; extras: Player[] } {
  const pool = new Set(activePlayers.map((p) => p.id));
  const playerMap = new Map(activePlayers.map((p) => [p.id, p]));
  const groups: Player[][] = [];

  // Build a sorted list of unmet pairs (lowest interaction count first)
  const pairDebts: { id1: string; id2: string; count: number }[] = [];
  const playerList = activePlayers.filter((p) => pool.has(p.id));
  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const count = getInteractionCount(history, playerList[i].id, playerList[j].id);
      pairDebts.push({ id1: playerList[i].id, id2: playerList[j].id, count });
    }
  }
  // Shuffle first for randomized tie-breaking, then sort by count ascending
  for (let i = pairDebts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairDebts[i], pairDebts[j]] = [pairDebts[j], pairDebts[i]];
  }
  pairDebts.sort((a, b) => a.count - b.count);

  for (let c = 0; c < effectiveCourts; c++) {
    if (pool.size < 4) break;

    // Find the highest-priority unmet pair still in the pool
    let seed1: string | undefined;
    let seed2: string | undefined;
    for (const debt of pairDebts) {
      if (pool.has(debt.id1) && pool.has(debt.id2)) {
        seed1 = debt.id1;
        seed2 = debt.id2;
        break;
      }
    }

    // Fallback: pick two random from pool
    if (!seed1 || !seed2) {
      const arr = Array.from(pool);
      seed1 = arr[0];
      seed2 = arr[1];
    }

    pool.delete(seed1);
    pool.delete(seed2);

    // Pick 2 more players that maximize new interactions with the seeds
    const remaining = Array.from(pool);
    const scored = remaining.map((id) => {
      // Count how many of the 2 seeds this player hasn't met
      let newPairs = 0;
      if (getInteractionCount(history, id, seed1!) === 0) newPairs++;
      if (getInteractionCount(history, id, seed2!) === 0) newPairs++;
      // Small tiebreaker: total unmet count (prefer players with more unmet people)
      let totalUnmet = 0;
      for (const otherId of remaining) {
        if (otherId !== id && getInteractionCount(history, id, otherId) === 0) totalUnmet++;
      }
      return { id, newPairs, totalUnmet, rand: Math.random() };
    });
    // Sort: most new pairs first, then most unmet, then random
    scored.sort((a, b) => {
      if (b.newPairs !== a.newPairs) return b.newPairs - a.newPairs;
      if (b.totalUnmet !== a.totalUnmet) return b.totalUnmet - a.totalUnmet;
      return a.rand - b.rand;
    });

    const pick3 = scored[0]?.id;
    if (pick3) pool.delete(pick3);

    // Re-score for 4th player considering all 3 already picked
    const remaining2 = Array.from(pool);
    const scored2 = remaining2.map((id) => {
      let newPairs = 0;
      if (getInteractionCount(history, id, seed1!) === 0) newPairs++;
      if (getInteractionCount(history, id, seed2!) === 0) newPairs++;
      if (pick3 && getInteractionCount(history, id, pick3) === 0) newPairs++;
      return { id, newPairs, rand: Math.random() };
    });
    scored2.sort((a, b) => {
      if (b.newPairs !== a.newPairs) return b.newPairs - a.newPairs;
      return a.rand - b.rand;
    });

    const pick4 = scored2[0]?.id;
    if (pick4) pool.delete(pick4);

    const group = [seed1, seed2, pick3, pick4]
      .filter(Boolean)
      .map((id) => playerMap.get(id!)!)
      .filter(Boolean);
    if (group.length === 4) {
      groups.push(group);
    }
  }

  const extras = Array.from(pool).map((id) => playerMap.get(id)!).filter(Boolean);
  return { groups, extras };
}

function findBestAssignment(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory,
  allPlayers?: Player[]
): { courts: CourtAssignment[]; extraSitOuts: Player[] } {
  const effectiveCourts = Math.min(numCourts, Math.floor(activePlayers.length / 4));
  const numNeeded = effectiveCourts * 4;

  if (effectiveCourts === 0) {
    return { courts: [], extraSitOuts: activePlayers };
  }

  let bestScore = Infinity;
  let bestCourts: CourtAssignment[] = [];
  let bestExtras: Player[] = [];

  // --- Greedy iterations: build courts targeting unmet pairs ---
  for (let i = 0; i < 500; i++) {
    const { groups, extras } = buildGreedyCourts(activePlayers, effectiveCourts, history);
    if (groups.length !== effectiveCourts) continue;

    const courts: CourtAssignment[] = groups.map((group, c) =>
      pickBestSplit(group, history, c + 1)
    );

    const score = scoreAssignment(courts, history, allPlayers);
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
      bestExtras = extras;
    }
  }

  // --- Random iterations: explore broader space ---
  for (let i = 0; i < 500; i++) {
    const shuffled = fisherYatesShuffle(activePlayers);
    const playersForCourts = shuffled.slice(0, numNeeded);
    const extras = shuffled.slice(numNeeded);

    const courts: CourtAssignment[] = [];
    for (let c = 0; c < effectiveCourts; c++) {
      const fourPlayers = playersForCourts.slice(c * 4, c * 4 + 4);
      courts.push(pickBestSplit(fourPlayers, history, c + 1));
    }

    const score = scoreAssignment(courts, history, allPlayers);
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
      bestExtras = extras;
    }
  }

  return { courts: bestCourts, extraSitOuts: bestExtras };
}

function findBestAssignmentWithLocks(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory,
  lockedPairs: LockedPair[],
  allPlayers?: Player[]
): { courts: CourtAssignment[]; extraSitOuts: Player[] } {
  const effectiveCourts = Math.min(numCourts, Math.floor(activePlayers.length / 4));

  if (effectiveCourts === 0) {
    return { courts: [], extraSitOuts: activePlayers };
  }

  // Build a map of locked pairs by courtIdx
  const locksByCourtIdx = new Map<number, LockedPair[]>();
  for (const lp of lockedPairs) {
    if (lp.courtIdx < effectiveCourts) {
      const existing = locksByCourtIdx.get(lp.courtIdx) || [];
      existing.push(lp);
      locksByCourtIdx.set(lp.courtIdx, existing);
    }
  }

  // Identify locked player IDs and resolve locked players
  const lockedIds = new Set<string>();
  const lockedPlayerMap = new Map<string, Player>();
  for (const p of activePlayers) {
    lockedPlayerMap.set(p.id, p);
  }
  for (const lp of lockedPairs) {
    lockedIds.add(lp.player1Id);
    lockedIds.add(lp.player2Id);
  }

  // Free players = active but not locked
  const freePlayers = activePlayers.filter((p) => !lockedIds.has(p.id));

  const NUM_ITERATIONS = 1000;
  let bestScore = Infinity;
  let bestCourts: CourtAssignment[] = [];
  let bestExtras: Player[] = [];

  for (let i = 0; i < NUM_ITERATIONS; i++) {
    const shuffled = fisherYatesShuffle(freePlayers);
    let freeIdx = 0;

    const courts: CourtAssignment[] = [];
    let valid = true;

    for (let c = 0; c < effectiveCourts; c++) {
      const courtsLocks = locksByCourtIdx.get(c) || [];
      const team1Lock = courtsLocks.find((lp) => lp.team === 'team1');
      const team2Lock = courtsLocks.find((lp) => lp.team === 'team2');

      let team1: Player[];
      let team2: Player[];

      if (team1Lock) {
        const p1 = lockedPlayerMap.get(team1Lock.player1Id);
        const p2 = lockedPlayerMap.get(team1Lock.player2Id);
        if (!p1 || !p2) { valid = false; break; }
        team1 = [p1, p2];
      } else {
        if (freeIdx + 2 > shuffled.length) { valid = false; break; }
        team1 = [shuffled[freeIdx++], shuffled[freeIdx++]];
      }

      if (team2Lock) {
        const p1 = lockedPlayerMap.get(team2Lock.player1Id);
        const p2 = lockedPlayerMap.get(team2Lock.player2Id);
        if (!p1 || !p2) { valid = false; break; }
        team2 = [p1, p2];
      } else {
        if (freeIdx + 2 > shuffled.length) { valid = false; break; }
        team2 = [shuffled[freeIdx++], shuffled[freeIdx++]];
      }

      // For fully-free courts, try pickBestSplit for optimal team split
      if (!team1Lock && !team2Lock) {
        const fourPlayers = [...team1, ...team2];
        courts.push(pickBestSplit(fourPlayers, history, c + 1));
      } else {
        courts.push({
          courtNumber: c + 1,
          team1,
          team2,
          ratingDiff: Math.abs(sumRatings(team1) - sumRatings(team2)),
        });
      }
    }

    if (!valid) continue;

    const extras = shuffled.slice(freeIdx);
    const score = scoreAssignment(courts, history, allPlayers);
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
      bestExtras = extras;
    }
  }

  // If no valid iteration found (edge case), return empty
  if (bestCourts.length === 0 && effectiveCourts > 0) {
    return { courts: [], extraSitOuts: activePlayers };
  }

  return { courts: bestCourts, extraSitOuts: bestExtras };
}

function findGenderedAssignment(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory,
  allPlayers?: Player[]
): { courts: CourtAssignment[]; extraSitOuts: Player[] } {
  const males = activePlayers.filter((p) => p.gender === 'M');
  const females = activePlayers.filter((p) => p.gender === 'F');

  const maxFemaleCourts = Math.floor(females.length / 4);
  const maxMaleCourts = Math.floor(males.length / 4);

  // Allocate as many gendered courts as possible
  const femaleCourts = Math.min(maxFemaleCourts, numCourts);
  const maleCourts = Math.min(maxMaleCourts, numCourts - femaleCourts);
  const mixedCourts = numCourts - femaleCourts - maleCourts;

  // Sort by genderedMixedCounts descending — players who've been in mixed
  // games more often get priority for gendered courts this round
  const sortedFemales = [...females].sort((a, b) => {
    const diff = (history.genderedMixedCounts[b.id] ?? 0) - (history.genderedMixedCounts[a.id] ?? 0);
    return diff !== 0 ? diff : Math.random() - 0.5;
  });
  const sortedMales = [...males].sort((a, b) => {
    const diff = (history.genderedMixedCounts[b.id] ?? 0) - (history.genderedMixedCounts[a.id] ?? 0);
    return diff !== 0 ? diff : Math.random() - 0.5;
  });

  // Split: top players go to gendered courts, rest to mixed pool
  const genderedFemales = sortedFemales.slice(0, femaleCourts * 4);
  const mixedFemales = sortedFemales.slice(femaleCourts * 4);
  const genderedMales = sortedMales.slice(0, maleCourts * 4);
  const mixedMales = sortedMales.slice(maleCourts * 4);

  const mixedPool = [...mixedMales, ...mixedFemales];

  // Run optimization on each group separately
  const femaleResult = femaleCourts > 0
    ? findBestAssignment(genderedFemales, femaleCourts, history, allPlayers)
    : { courts: [] as CourtAssignment[], extraSitOuts: [] as Player[] };
  const maleResult = maleCourts > 0
    ? findBestAssignment(genderedMales, maleCourts, history, allPlayers)
    : { courts: [] as CourtAssignment[], extraSitOuts: [] as Player[] };
  const mixedResult = mixedCourts > 0
    ? findBestAssignment(mixedPool, mixedCourts, history, allPlayers)
    : { courts: [] as CourtAssignment[], extraSitOuts: [] as Player[] };

  // Combine and renumber courts sequentially
  const allCourts = [...femaleResult.courts, ...maleResult.courts, ...mixedResult.courts];
  allCourts.forEach((court, i) => {
    court.courtNumber = i + 1;
  });

  const allExtras = [
    ...femaleResult.extraSitOuts,
    ...maleResult.extraSitOuts,
    ...mixedResult.extraSitOuts,
  ];

  return { courts: allCourts, extraSitOuts: allExtras };
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

function updateGenderedMixedCounts(
  history: PairingHistory,
  courts: CourtAssignment[]
) {
  for (const court of courts) {
    const allPlayers = [...court.team1, ...court.team2];
    const genders = new Set(allPlayers.map((p) => p.gender));
    if (genders.size > 1) {
      // Mixed court on a gendered round
      for (const p of allPlayers) {
        history.genderedMixedCounts[p.id] = (history.genderedMixedCounts[p.id] ?? 0) + 1;
      }
    }
  }
}

export function generateSchedule(
  players: Player[],
  numCourts: number,
  numRounds: number,
  genderedEnabled = false,
  genderedFrequency = 2
): Schedule {
  const history = initHistory(players);
  const rounds: Round[] = [];

  for (let r = 1; r <= numRounds; r++) {
    const isGendered = genderedEnabled && r % genderedFrequency === 0;

    const sitOuts = determineSitOuts(players, numCourts, history);
    const activePlayers = players.filter(
      (p) => !sitOuts.some((s) => s.id === p.id)
    );

    const { courts, extraSitOuts } = isGendered
      ? findGenderedAssignment(activePlayers, numCourts, history, players)
      : findBestAssignment(activePlayers, numCourts, history, players);

    const allSitOuts = [...sitOuts, ...extraSitOuts];
    updateHistory(history, courts, allSitOuts);

    if (isGendered) {
      updateGenderedMixedCounts(history, courts);
    }

    rounds.push({
      roundNumber: r,
      courts,
      sitOuts: allSitOuts,
      isGendered: isGendered || undefined,
    });
  }

  return { rounds };
}

export function reshuffleSchedule(
  players: Player[],
  numCourts: number,
  numRounds: number,
  locks: Record<number, LockedPair[]>,
  genderedEnabled = false,
  genderedFrequency = 2
): Schedule {
  const history = initHistory(players);
  const rounds: Round[] = [];
  let previousSitOutIds: Set<string> | undefined;

  for (let r = 1; r <= numRounds; r++) {
    const roundIdx = r - 1;
    const isGendered = genderedEnabled && r % genderedFrequency === 0;
    const roundLocks = locks[roundIdx] || [];
    const hasLocks = roundLocks.length > 0;

    // Locked players cannot sit out
    const lockedIds = hasLocks
      ? new Set(roundLocks.flatMap((lp) => [lp.player1Id, lp.player2Id]))
      : undefined;

    const sitOuts = determineSitOuts(
      players, numCourts, history, lockedIds, previousSitOutIds
    );
    const sitOutIds = new Set(sitOuts.map((p) => p.id));
    const activePlayers = players.filter((p) => !sitOutIds.has(p.id));

    let courts: CourtAssignment[];
    let extraSitOuts: Player[];

    if (hasLocks) {
      // Locks override gendered constraints
      const result = findBestAssignmentWithLocks(activePlayers, numCourts, history, roundLocks, players);
      courts = result.courts;
      extraSitOuts = result.extraSitOuts;
    } else if (isGendered) {
      const result = findGenderedAssignment(activePlayers, numCourts, history, players);
      courts = result.courts;
      extraSitOuts = result.extraSitOuts;
    } else {
      const result = findBestAssignment(activePlayers, numCourts, history, players);
      courts = result.courts;
      extraSitOuts = result.extraSitOuts;
    }

    const allSitOuts = [...sitOuts, ...extraSitOuts];
    updateHistory(history, courts, allSitOuts);

    if (isGendered && !hasLocks) {
      updateGenderedMixedCounts(history, courts);
    }

    previousSitOutIds = new Set(allSitOuts.map((p) => p.id));

    rounds.push({
      roundNumber: r,
      courts,
      sitOuts: allSitOuts,
      isGendered: (isGendered && !hasLocks) || undefined,
    });
  }

  return { rounds };
}
