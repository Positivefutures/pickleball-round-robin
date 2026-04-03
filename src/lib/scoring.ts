import type { CourtAssignment, PairingHistory, Player } from '../types';
import { sumRatings } from '../utils/helpers';

const BALANCE_WEIGHT = 5.0;
const PARTNER_REPEAT_WEIGHT = 8.0;
const OPPONENT_REPEAT_WEIGHT = 6.0;
const NOVELTY_BONUS = 15.0;
const COVERAGE_WEIGHT = 3.0;
const REPEAT_EXPONENT = 1.5;

function getCount(
  counts: Record<string, Record<string, number>>,
  id1: string,
  id2: string
): number {
  return counts[id1]?.[id2] ?? 0;
}

function getInteractionCount(
  history: PairingHistory,
  id1: string,
  id2: string
): number {
  return getCount(history.partnerCounts, id1, id2)
    + getCount(history.opponentCounts, id1, id2);
}

function countUnmet(
  playerId: string,
  allPlayerIds: string[],
  history: PairingHistory
): number {
  let unmet = 0;
  for (const otherId of allPlayerIds) {
    if (otherId === playerId) continue;
    if (getInteractionCount(history, playerId, otherId) === 0) {
      unmet++;
    }
  }
  return unmet;
}

export function scoreAssignment(
  courts: CourtAssignment[],
  history: PairingHistory,
  allPlayers?: Player[]
): number {
  const allPlayerIds = allPlayers ? allPlayers.map((p) => p.id) : [];
  const totalPlayers = allPlayerIds.length;
  let totalScore = 0;

  for (const court of courts) {
    const team1Rating = sumRatings(court.team1);
    const team2Rating = sumRatings(court.team2);
    const balancePenalty = Math.abs(team1Rating - team2Rating) * BALANCE_WEIGHT;

    let partnerPenalty = 0;
    for (const team of [court.team1, court.team2]) {
      if (team.length === 2) {
        const count = getCount(history.partnerCounts, team[0].id, team[1].id);
        partnerPenalty += Math.pow(count, REPEAT_EXPONENT) * PARTNER_REPEAT_WEIGHT;
      }
    }

    let opponentPenalty = 0;
    for (const p1 of court.team1) {
      for (const p2 of court.team2) {
        const count = getCount(history.opponentCounts, p1.id, p2.id);
        opponentPenalty += Math.pow(count, REPEAT_EXPONENT) * OPPONENT_REPEAT_WEIGHT;
      }
    }

    // Novelty bonus and coverage penalty across all 6 pairs on the court
    const courtPlayers = [...court.team1, ...court.team2];
    let noveltyBonus = 0;
    let coveragePenalty = 0;

    for (let i = 0; i < courtPlayers.length; i++) {
      for (let j = i + 1; j < courtPlayers.length; j++) {
        const id1 = courtPlayers[i].id;
        const id2 = courtPlayers[j].id;
        const interactions = getInteractionCount(history, id1, id2);

        if (interactions === 0) {
          // These two have never played together — reward this
          noveltyBonus += NOVELTY_BONUS;
        } else if (totalPlayers > 0) {
          // They've already met — penalize proportional to how many unmet players they each have
          const unmet1 = countUnmet(id1, allPlayerIds, history);
          const unmet2 = countUnmet(id2, allPlayerIds, history);
          coveragePenalty += COVERAGE_WEIGHT * (unmet1 + unmet2) / totalPlayers;
        }
      }
    }

    totalScore += balancePenalty + partnerPenalty + opponentPenalty + coveragePenalty - noveltyBonus;
  }

  return totalScore;
}
