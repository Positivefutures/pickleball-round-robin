import type { CourtAssignment, PairingHistory } from '../types';
import { sumRatings } from '../utils/helpers';

const BALANCE_WEIGHT = 10.0;
const PARTNER_REPEAT_WEIGHT = 8.0;
const OPPONENT_REPEAT_WEIGHT = 4.0;

function getCount(
  counts: Record<string, Record<string, number>>,
  id1: string,
  id2: string
): number {
  return counts[id1]?.[id2] ?? 0;
}

export function scoreAssignment(
  courts: CourtAssignment[],
  history: PairingHistory
): number {
  let totalScore = 0;

  for (const court of courts) {
    const team1Rating = sumRatings(court.team1);
    const team2Rating = sumRatings(court.team2);
    const balancePenalty = Math.abs(team1Rating - team2Rating) * BALANCE_WEIGHT;

    let partnerPenalty = 0;
    for (const team of [court.team1, court.team2]) {
      if (team.length === 2) {
        const count = getCount(history.partnerCounts, team[0].id, team[1].id);
        partnerPenalty += count * PARTNER_REPEAT_WEIGHT;
      }
    }

    let opponentPenalty = 0;
    for (const p1 of court.team1) {
      for (const p2 of court.team2) {
        const count = getCount(history.opponentCounts, p1.id, p2.id);
        opponentPenalty += count * OPPONENT_REPEAT_WEIGHT;
      }
    }

    totalScore += balancePenalty + partnerPenalty + opponentPenalty;
  }

  return totalScore;
}
