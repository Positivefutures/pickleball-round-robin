import type { Player, PairingHistory, Partnership, Round } from '../types';
import { courtRatingDiff } from '../utils/helpers';

/**
 * The one place going spare in a round, or null if there are none or several.
 *
 * Several is the interesting case. One gap has only one answer, so the app can
 * give it. Two gaps and a bench is a choice about who plays with whom, and
 * guessing at it would be worse than asking.
 */
function loneEmptyPlace(round: Round): { courtIdx: number; team: 'team1' | 'team2' } | null {
  let found: { courtIdx: number; team: 'team1' | 'team2' } | null = null;
  let spare = 0;
  round.courts.forEach((court, courtIdx) => {
    for (const team of ['team1', 'team2'] as const) {
      const gaps = 2 - court[team].length;
      if (gaps <= 0) continue;
      spare += gaps;
      found ??= { courtIdx, team };
    }
  });
  return spare === 1 ? found : null;
}

/**
 * Puts somebody arriving mid-session into every round still to be played,
 * leaving the rounds already played exactly as they are.
 *
 * A round with one place going spare — a 2v1 waiting on a fourth — takes them
 * straight onto the court, because there is nowhere else they could go and
 * making the host tap it in for every remaining round is busywork. A round with
 * two places spare, or none at all, puts them on the bench: the first because
 * who partners whom is the host's call, the second because there is no room.
 *
 * Completed rounds come back by reference — they are history, and sharing them
 * makes that obvious to anything comparing rounds.
 */
export function addToRemainingRounds(
  rounds: Round[],
  completedRoundNumbers: number[],
  player: Player
): Round[] {
  const completed = new Set(completedRoundNumbers);
  return rounds.map((round) => {
    if (completed.has(round.roundNumber)) return round;

    const place = loneEmptyPlace(round);
    if (!place) return { ...round, sitOuts: [...round.sitOuts, player] };

    const courts = round.courts.map((court, courtIdx) => {
      if (courtIdx !== place.courtIdx) return court;
      const next = { ...court, team1: [...court.team1], team2: [...court.team2] };
      next[place.team].push(player);
      next.ratingDiff = courtRatingDiff(next.team1, next.team2);
      return next;
    });
    return { ...round, courts };
  });
}

/**
 * One player stands in for another, wherever the one going off appears.
 *
 * Courts and bench alike, and the place is kept: the substitute plays the games
 * the player they replaced was down for, against the same people. That is the
 * difference between this and removing somebody and adding somebody else, which
 * rebuilds the remaining rounds and scatters everyone.
 *
 * The same swap with the same id on both sides is how an edited player is
 * carried into a schedule that holds copies of them. Pass no skipped rounds for
 * that, so the person reads the same on every round of the page.
 *
 * Rounds nothing happened to come back by reference, so a caller can tell at a
 * glance which ones were touched.
 */
export function replacePlayerInRounds(
  rounds: Round[],
  outgoingId: string,
  incoming: Player,
  skipRoundNumbers: number[] = []
): Round[] {
  const skip = new Set(skipRoundNumbers);

  return rounds.map((round) => {
    if (skip.has(round.roundNumber)) return round;

    let changed = false;

    const courts = round.courts.map((court) => {
      const swap = (team: Player[]) =>
        team.map((p) => (p.id === outgoingId ? incoming : p));
      const team1 = swap(court.team1);
      const team2 = swap(court.team2);
      const touched =
        team1.some((p, i) => p !== court.team1[i]) ||
        team2.some((p, i) => p !== court.team2[i]);
      if (!touched) return court;
      changed = true;
      return { ...court, team1, team2, ratingDiff: courtRatingDiff(team1, team2) };
    });

    const sitOuts = round.sitOuts.map((p) => (p.id === outgoingId ? incoming : p));
    if (sitOuts.some((p, i) => p !== round.sitOuts[i])) changed = true;

    return changed ? { ...round, courts, sitOuts } : round;
  });
}

// A sit-out candidate unit: a single player, or a fixed pair that must sit
// together. Partnered players are never split across the sit-out line.
interface SitOutUnit {
  players: Player[];
  avgGames: number;
  prevSat: boolean; // any member sat out the previous round
  misses: number; // rounds of this round's game type the unit has missed
}

/**
 * @param missCounts On a special round, how many rounds of that type each player
 *   has already missed. Used only to break ties that fair rotation leaves open,
 *   so someone owed the game type keeps their place on court.
 */
export function determineSitOuts(
  players: Player[],
  numCourts: number,
  history: PairingHistory,
  excludeIds?: Set<string>,
  previousSitOutIds?: Set<string>,
  partnerships?: Partnership[],
  missCounts?: Record<string, number>
): Player[] {
  const maxActive = numCourts * 4;
  const candidates = excludeIds
    ? players.filter((p) => !excludeIds.has(p.id))
    : players;

  const totalActive = candidates.length + (excludeIds ? excludeIds.size : 0);
  if (totalActive <= maxActive) {
    return [];
  }

  const numSitOuts = totalActive - maxActive;
  if (numSitOuts <= 0) return [];

  const missed = (p: Player) => (missCounts ? missCounts[p.id] ?? 0 : 0);

  // No partnerships → original per-player behaviour (unchanged).
  if (!partnerships || partnerships.length === 0) {
    const sorted = [...candidates].sort((a, b) => {
      const aPlayed = history.gamesPlayed[a.id] ?? 0;
      const bPlayed = history.gamesPlayed[b.id] ?? 0;
      if (bPlayed !== aPlayed) return bPlayed - aPlayed;

      // Avoid consecutive sit-outs: prefer sitting players who did NOT sit last round
      if (previousSitOutIds) {
        const aPrev = previousSitOutIds.has(a.id) ? 1 : 0;
        const bPrev = previousSitOutIds.has(b.id) ? 1 : 0;
        if (aPrev !== bPrev) return aPrev - bPrev; // non-previous first
      }

      // Everything else equal, sit whoever has already had this game type
      if (missCounts && missed(a) !== missed(b)) return missed(a) - missed(b);

      return Math.random() - 0.5;
    });

    return sorted.slice(0, numSitOuts);
  }

  // Partnership-aware: build sit-out units so couples sit together. Nobody sits
  // out unless every court is full — a roster short of that puts the spare
  // players on a 2v1 rather than on the bench — so past this point the active
  // count after sitting out is exactly
  // 4 * effectiveCourts, so a partnership can never occupy more than the
  // available team slots — every unit selection that hits the target is
  // court-feasible. Parity also always resolves: numSitOuts has the same parity
  // as the candidate count, and an odd candidate count guarantees an unpaired
  // single exists, so a greedy fill by fairness always reaches the exact target.
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const claimed = new Set<string>();
  const units: SitOutUnit[] = [];

  const games = (p: Player) => history.gamesPlayed[p.id] ?? 0;
  const sat = (p: Player) => (previousSitOutIds ? previousSitOutIds.has(p.id) : false);

  // Pair units first, from partnerships whose members are both sit-out candidates.
  for (const pr of partnerships) {
    const p1 = byId.get(pr.player1Id);
    const p2 = byId.get(pr.player2Id);
    if (!p1 || !p2 || claimed.has(p1.id) || claimed.has(p2.id)) continue;
    claimed.add(p1.id);
    claimed.add(p2.id);
    units.push({
      players: [p1, p2],
      avgGames: (games(p1) + games(p2)) / 2,
      prevSat: sat(p1) || sat(p2),
      misses: Math.min(missed(p1), missed(p2)),
    });
  }

  // Everyone else is a single unit.
  for (const p of candidates) {
    if (claimed.has(p.id)) continue;
    units.push({ players: [p], avgGames: games(p), prevSat: sat(p), misses: missed(p) });
  }

  // Highest games-played sits first; avoid back-to-back sit-outs; then sit
  // whoever has already had this round's game type; random tie-break.
  units.sort((a, b) => {
    if (b.avgGames !== a.avgGames) return b.avgGames - a.avgGames;
    if (a.prevSat !== b.prevSat) return (a.prevSat ? 1 : 0) - (b.prevSat ? 1 : 0);
    if (missCounts && a.misses !== b.misses) return a.misses - b.misses;
    return Math.random() - 0.5;
  });

  const result: Player[] = [];
  let remaining = numSitOuts;
  for (const u of units) {
    if (remaining <= 0) break;
    if (u.players.length <= remaining) {
      result.push(...u.players);
      remaining -= u.players.length;
    }
  }

  return result;
}
