import type { CourtAssignment, PairingHistory, Player } from '../types';

/**
 * Which side of the court each team takes.
 *
 * The left-hand team, `team1`, serves first. The printed sheet says so in as
 * many words, with SERVING and RECEIVING over its two columns, and the serving
 * side supplies the ball. Outdoors it also gets whichever end the sun and the
 * wind make worse, or better, so a team that serves every game has had a
 * different evening from one that never does.
 *
 * Nothing decided this before. Every solver wrote the two teams down in the
 * order it happened to build them, and on a night of partner play that order
 * was the fixture list, which always names the lower-numbered team first: the
 * pair whose key sorted first served every round of the evening and the pair
 * whose key sorted last received every round. Jeff read it off a real sheet —
 * six pairs, eight rounds, one pair serving eight of eight and another
 * receiving eight of eight. Set Partners had a quieter version of the same
 * fault, seating a couple on the left whenever it faced two singles.
 *
 * ## Why this is a deal and not a coin flip
 *
 * A coin flip per court is unbiased and still not good enough: over eight
 * rounds it leaves roughly one schedule in five with some team serving seven
 * of them, which is the lopsidedness that was complained about. So, like the
 * court rotation, this deals: whichever team has served less so far takes the
 * serving side, counted per player, and only a genuine tie is settled by the
 * coin. The first round is all ties, so it comes out random, and every round
 * after that pulls the counts back together.
 *
 * ## Why this is not a term in the cost function
 *
 * The same argument as rotateCourts. This runs after the pairings are chosen
 * and turns each court round or leaves it, so it cannot make a match worse:
 * every group of four is exactly the one the solver picked. And it runs on
 * every path, including partner play, which never reaches the scorer.
 *
 * ## What it will not turn
 *
 * A round with a padlock on it. A padlock names a side as well as a court,
 * which is the host pinning this round by hand.
 *
 * A 2v1. Who is on their own there is decided by rating, and the pair takes
 * the pair side; there is no fair way to swap them. A game of singles has no
 * such reason and is dealt like any other court.
 */

function served(team: Player[], history: PairingHistory): number {
  return team.reduce((sum, p) => sum + (history.serveCounts[p.id] ?? 0), 0);
}

/** A 2v1 has a pair side and a single side, and they are not interchangeable. */
function isTwoOnOne(court: CourtAssignment): boolean {
  return court.team1.length !== court.team2.length;
}

function turned(court: CourtAssignment): CourtAssignment {
  // ratingDiff is an absolute difference, so it is the same either way round.
  return { ...court, team1: court.team2, team2: court.team1 };
}

/**
 * The round's courts, each turned so that the team owed a serve is on the left,
 * or left as it came when neither is owed one. Everything else about a court —
 * its number, its four players, its score — is untouched.
 */
export function dealSides(
  courts: CourtAssignment[],
  history: PairingHistory,
  opts: { pinned?: boolean } = {}
): CourtAssignment[] {
  if (opts.pinned) return courts;

  return courts.map((court) => {
    if (isTwoOnOne(court)) return court;
    const left = served(court.team1, history);
    const right = served(court.team2, history);
    if (left < right) return court;
    if (right < left) return turned(court);
    return Math.random() < 0.5 ? court : turned(court);
  });
}
