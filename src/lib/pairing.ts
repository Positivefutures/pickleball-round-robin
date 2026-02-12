import type { Player, CourtAssignment, Round, Schedule, PairingHistory } from '../types';
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

  for (const [team1, team2] of splits) {
    const ratingDiff = Math.abs(sumRatings(team1) - sumRatings(team2));
    let partnerPenalty = 0;
    partnerPenalty += (history.partnerCounts[team1[0].id]?.[team1[1].id] ?? 0);
    partnerPenalty += (history.partnerCounts[team2[0].id]?.[team2[1].id] ?? 0);
    const score = ratingDiff * 10 + partnerPenalty * 8;
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

function findBestAssignment(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory
): { courts: CourtAssignment[]; extraSitOuts: Player[] } {
  const effectiveCourts = Math.min(numCourts, Math.floor(activePlayers.length / 4));
  const numNeeded = effectiveCourts * 4;

  if (effectiveCourts === 0) {
    return { courts: [], extraSitOuts: activePlayers };
  }

  const NUM_ITERATIONS = 1000;
  let bestScore = Infinity;
  let bestCourts: CourtAssignment[] = [];
  let bestExtras: Player[] = [];

  for (let i = 0; i < NUM_ITERATIONS; i++) {
    const shuffled = fisherYatesShuffle(activePlayers);
    const playersForCourts = shuffled.slice(0, numNeeded);
    const extras = shuffled.slice(numNeeded);

    const courts: CourtAssignment[] = [];
    for (let c = 0; c < effectiveCourts; c++) {
      const fourPlayers = playersForCourts.slice(c * 4, c * 4 + 4);
      courts.push(pickBestSplit(fourPlayers, history, c + 1));
    }

    const score = scoreAssignment(courts, history);
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
      bestExtras = extras;
    }
  }

  return { courts: bestCourts, extraSitOuts: bestExtras };
}

function findGenderedAssignment(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory
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
    ? findBestAssignment(genderedFemales, femaleCourts, history)
    : { courts: [] as CourtAssignment[], extraSitOuts: [] as Player[] };
  const maleResult = maleCourts > 0
    ? findBestAssignment(genderedMales, maleCourts, history)
    : { courts: [] as CourtAssignment[], extraSitOuts: [] as Player[] };
  const mixedResult = mixedCourts > 0
    ? findBestAssignment(mixedPool, mixedCourts, history)
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
      ? findGenderedAssignment(activePlayers, numCourts, history)
      : findBestAssignment(activePlayers, numCourts, history);

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
