import type { CourtAssignment, Partnership, Player, Round } from '../types';
import { courtRatingDiff } from '../utils/helpers';
import { pickShortSplit } from './assign';
import { MAX_COURT_NUMBER } from './courtNumbers';
import { partnerKey } from './partnerships';

/**
 * Courts arriving and leaving in the middle of a session.
 *
 * A club hands over a fourth court at half past nine, or takes one back. Neither
 * is a reason to rebuild the morning, so both of these edit the rounds still to
 * be played and leave the ones already played alone. Reshuffling afterwards is
 * the host's call, not the app's.
 *
 * Neither goes anywhere near the pairing engine, and that is deliberate:
 * effectiveCourtCount() would refuse a court the roster cannot fill, and a host
 * who has just been given a court wants to see it whether or not there is anyone
 * to put on it.
 */

/** How many games each player has had, counted straight off the schedule. */
function gamesPlayed(rounds: Round[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const round of rounds) {
    for (const court of round.courts) {
      for (const p of [...court.team1, ...court.team2]) {
        counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
      }
    }
  }
  return counts;
}

// A couple moves as one, exactly as it does on the sit-out line. Everybody else
// is a unit of one.
function benchUnits(bench: Player[], partnerships: Partnership[]): Player[][] {
  const byId = new Map(bench.map((p) => [p.id, p]));
  const claimed = new Set<string>();
  const units: Player[][] = [];

  for (const pr of partnerships) {
    const p1 = byId.get(pr.player1Id);
    const p2 = byId.get(pr.player2Id);
    if (!p1 || !p2 || claimed.has(p1.id) || claimed.has(p2.id)) continue;
    claimed.add(p1.id);
    claimed.add(p2.id);
    units.push([p1, p2]);
  }
  for (const p of bench) {
    if (!claimed.has(p.id)) units.push([p]);
  }
  return units;
}

/**
 * Four players split into two sides of two, as level as their ratings allow.
 *
 * Strongest with weakest against the middle pair is the closest split of any
 * four, and a couple outranks it: Set Partners means Set Partners.
 */
function pickFourSplit(
  four: Player[],
  courtNumber: number,
  coupleKeys: Set<string>
): CourtAssignment {
  const court = (team1: Player[], team2: Player[]): CourtAssignment => ({
    courtNumber,
    team1,
    team2,
    ratingDiff: courtRatingDiff(team1, team2),
  });

  for (let i = 0; i < four.length; i++) {
    for (let j = i + 1; j < four.length; j++) {
      if (!coupleKeys.has(partnerKey(four[i].id, four[j].id))) continue;
      return court([four[i], four[j]], four.filter((_, k) => k !== i && k !== j));
    }
  }

  const byRating = [...four].sort((a, b) => b.rating - a.rating);
  return court([byRating[0], byRating[3]], [byRating[1], byRating[2]]);
}

/**
 * Adds a court to every round still to be played, and puts the bench on it.
 *
 * Whoever has had fewest games goes on first, so the extra court pays back the
 * people it is owed to rather than the ones nearest the top of the list. Places
 * it cannot fill are left empty for the host to tap somebody into.
 *
 * Fewer than two waiting means nobody is seated at all. One player on a court is
 * not a game, and standing somebody there alone would be worse than the bench.
 */
export function addCourtToRemaining(
  rounds: Round[],
  completedRoundNumbers: number[],
  partnerships: Partnership[] = []
): Round[] {
  const completed = new Set(completedRoundNumbers);
  const played = gamesPlayed(rounds);
  const coupleKeys = new Set(partnerships.map((p) => partnerKey(p.player1Id, p.player2Id)));
  const games = (p: Player) => played.get(p.id) ?? 0;

  return rounds.map((round) => {
    if (completed.has(round.roundNumber)) return round;

    // One past the highest number in the round, not one past the court count:
    // a centre that gave out courts 7, 8 and 9 has just given out court 10.
    const highest = round.courts.reduce((max, c) => Math.max(max, c.courtNumber), 0);
    const courtNumber = Math.min(highest + 1, MAX_COURT_NUMBER);

    const units = benchUnits(round.sitOuts, partnerships).sort((a, b) => {
      const aGames = a.reduce((sum, p) => sum + games(p), 0) / a.length;
      const bGames = b.reduce((sum, p) => sum + games(p), 0) / b.length;
      return aGames - bGames;
    });

    const seated: Player[] = [];
    for (const unit of units) {
      if (seated.length + unit.length > 4) continue;
      seated.push(...unit);
      if (seated.length === 4) break;
    }

    if (seated.length < 2) {
      const empty: CourtAssignment = { courtNumber, team1: [], team2: [], ratingDiff: 0 };
      return { ...round, courts: [...round.courts, empty] };
    }

    const seatedIds = new Set(seated.map((p) => p.id));
    const court =
      seated.length === 4
        ? pickFourSplit(seated, courtNumber, coupleKeys)
        : pickShortSplit(seated, courtNumber, coupleKeys);

    return {
      ...round,
      courts: [...round.courts, court],
      sitOuts: round.sitOuts.filter((p) => !seatedIds.has(p.id)),
    };
  });
}

/**
 * Takes a court back from every round still to be played. Whoever was standing
 * on it sits out those rounds instead.
 *
 * The court is found by the number on it rather than by its position, so it is
 * the court the host pointed at that goes. The ones left keep their own numbers:
 * losing court 8 does not turn court 9 into court 8.
 */
export function removeCourtFromRemaining(
  rounds: Round[],
  completedRoundNumbers: number[],
  courtNumber: number
): Round[] {
  const completed = new Set(completedRoundNumbers);

  return rounds.map((round) => {
    if (completed.has(round.roundNumber)) return round;

    const court = round.courts.find((c) => c.courtNumber === courtNumber);
    if (!court) return round;

    return {
      ...round,
      courts: round.courts.filter((c) => c !== court),
      sitOuts: [...round.sitOuts, ...court.team1, ...court.team2],
    };
  });
}
