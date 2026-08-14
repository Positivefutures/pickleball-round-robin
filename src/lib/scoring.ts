import type { CourtAssignment, PairingHistory, Player } from '../types';
import { courtRatingDiff } from '../utils/helpers';
import { partnerKey } from './partnerships';

// The weights rank what the host was promised, in order: partner variety first,
// then opponent variety, then even teams, then the shape of the court's genders.
// Variety outranks balance on purpose — the cap used to carry a 200x penalty
// that bought balanced courts by repeating partnerships, and 44% of measured
// repeats traced back to it.
const BALANCE_WEIGHT = 3.0;
const PARTNER_REPEAT_WEIGHT = 40.0;
const OPPONENT_REPEAT_WEIGHT = 10.0;
const NOVELTY_BONUS = 25.0;
const COVERAGE_WEIGHT = 5.0;
const REPEAT_EXPONENT = 2.0;
const MAX_RATING_DIFF = 0.5;
// Past the 0.5 target the gap is fined at 150 per point of rating: a strong
// preference, not a wall. Against a first repeat partnership the indifference
// point sits near a 0.9 gap, so a repeat is refused up to a noticeably uneven
// court and accepted past that. At 50 the measured p95 gap hit 1.5, which is
// a hiding; at the old 200 the cap bought balanced courts with repeats.
const CAP_OVERAGE_WEIGHT = 150.0;
// Partnering again within two rounds is fined on top of the repeat itself:
// +50 for back-to-back, +25 with one round between. Cumulative counts cannot
// see the difference; `lastPartneredRound` can.
const PARTNER_RECENCY_WEIGHT = 25.0;
const RECENCY_WINDOW = 3;
// A team that has never partnered earns a bonus. Keyed on partnerCounts alone,
// not on "never met", which saturates mid-session and used to switch the
// variety terms off exactly where the repeats appeared.
const FRESH_PARTNER_BONUS = 15.0;
// Most people would rather play a gendered game or a mixed one than 3-and-1,
// and one woman with three men is the least liked shape of all. Kept below a
// first repeat opponent (10), well below everything above that, so the shape
// decides ties and can never buy a repeat partnership. When the men playing
// are odd in number, one 3:1 court is unavoidable — these steer which shape
// it takes.
const GENDER_LOPSIDED_3M1W = 8.0;
const GENDER_LOPSIDED_3W1M = 4.0;

function getCount(
  counts: Record<string, Record<string, number>>,
  id1: string,
  id2: string
): number {
  return counts[id1]?.[id2] ?? 0;
}

export function getPartnerCount(
  history: PairingHistory,
  id1: string,
  id2: string
): number {
  return getCount(history.partnerCounts, id1, id2);
}

export function getInteractionCount(
  history: PairingHistory,
  id1: string,
  id2: string
): number {
  return getCount(history.partnerCounts, id1, id2)
    + getCount(history.opponentCounts, id1, id2);
}

/**
 * What partnering these two again costs right now: the squared repeat penalty
 * plus the recency fine when they were a team within the last two rounds.
 * Zero for a pair that has never partnered. The court scorer, the fresh-team
 * matcher and the short-court draw all price a pairing through here, so
 * "how bad is a repeat" has exactly one answer.
 */
export function partnerRepeatCost(
  history: PairingHistory,
  id1: string,
  id2: string
): number {
  const count = getCount(history.partnerCounts, id1, id2);
  if (count === 0) return 0;
  let cost = Math.pow(count, REPEAT_EXPONENT) * PARTNER_REPEAT_WEIGHT;
  const last = history.lastPartneredRound?.[partnerKey(id1, id2)];
  if (last !== undefined) {
    const gap = (history.roundsRecorded ?? 0) + 1 - last;
    cost += PARTNER_RECENCY_WEIGHT * Math.max(0, RECENCY_WINDOW - gap);
  }
  return cost;
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

/**
 * The cost of one court. Every solver scores through here — the round-wide
 * samplers via `scoreAssignment` and the split chooser in `pickBestSplit`
 * directly — so one concept has one weight. Two sets of weights used to live
 * side by side and quietly disagree.
 *
 * The coverage term needs to know the whole roster, so it only runs when
 * `allPlayerIds` is passed. The split chooser leaves it out: all three splits
 * of the same four players share the same six pairs, so it cancels anyway.
 */
export function scoreCourt(
  court: CourtAssignment,
  history: PairingHistory,
  allPlayerIds?: string[]
): number {
  // Averaged when the sides are uneven, or a 2v1 reads as a 3.5 gap and the
  // hard cap below fines the solver hundreds of points for a court it was
  // told to build.
  const ratingDiff = courtRatingDiff(court.team1, court.team2);
  let balancePenalty = ratingDiff * BALANCE_WEIGHT;
  if (ratingDiff > MAX_RATING_DIFF) {
    balancePenalty += CAP_OVERAGE_WEIGHT * (ratingDiff - MAX_RATING_DIFF);
  }

  let partnerPenalty = 0;
  for (const team of [court.team1, court.team2]) {
    if (team.length === 2) {
      const count = getCount(history.partnerCounts, team[0].id, team[1].id);
      if (count === 0) {
        partnerPenalty -= FRESH_PARTNER_BONUS;
      } else {
        partnerPenalty += partnerRepeatCost(history, team[0].id, team[1].id);
      }
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
        // These two have never played together — big reward
        noveltyBonus += NOVELTY_BONUS;
      } else if (allPlayerIds && allPlayerIds.length > 0) {
        // They've already met — penalize proportional to how many unmet players they each have
        const unmet1 = countUnmet(id1, allPlayerIds, history);
        const unmet2 = countUnmet(id2, allPlayerIds, history);
        coveragePenalty += COVERAGE_WEIGHT * (unmet1 + unmet2) / allPlayerIds.length;
      }
    }
  }

  // The gender shape of the court. Only a full court can be 3:1, and a
  // gendered or mixed court passes untouched: 4:0 and 2:2 both cost nothing.
  let genderPenalty = 0;
  if (courtPlayers.length === 4) {
    const men = courtPlayers.filter((p) => p.gender === 'M').length;
    if (men === 3) genderPenalty = GENDER_LOPSIDED_3M1W;
    else if (men === 1) genderPenalty = GENDER_LOPSIDED_3W1M;
  }

  return balancePenalty + partnerPenalty + opponentPenalty + coveragePenalty
    + genderPenalty - noveltyBonus;
}

export function scoreAssignment(
  courts: CourtAssignment[],
  history: PairingHistory,
  allPlayers?: Player[]
): number {
  const allPlayerIds = allPlayers ? allPlayers.map((p) => p.id) : undefined;
  let totalScore = 0;
  for (const court of courts) {
    totalScore += scoreCourt(court, history, allPlayerIds);
  }
  return totalScore;
}
