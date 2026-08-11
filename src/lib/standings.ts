import type { CourtAssignment, CourtScore, Player, Schedule } from '../types';

/**
 * The table: who has won what, from the scores the host has written down.
 *
 * Not to be confused with scoring.ts next door, which is the scheduler's cost
 * function and has nothing to do with the game score.
 *
 * Deliberately free of React and of stores. It takes a schedule and a list of
 * players and returns rows. That is what lets the same numbers be computed from
 * a session pulled off the wire as from the one in this browser.
 *
 * On a court the roster could not fill — a 2v1, or a game of singles — the lone
 * player takes the full win and the full points, the same as each member of a
 * pair. No halving. The table is per player, the game was played, and half a win
 * would need explaining in a panel that has no room to explain anything.
 */

export type Side = 'team1' | 'team2';

/**
 * Which side took the game, or null where the two are level.
 *
 * A draw is not a pickleball result, but it is a state the host can save on the
 * way to typing 11-13, and it must not quietly become a win for whichever side
 * happens to be drawn on the left.
 */
export function winnerOfScore(score: CourtScore): Side | null {
  if (score.team1 > score.team2) return 'team1';
  if (score.team2 > score.team1) return 'team2';
  return null;
}

/**
 * A court with a score worth counting: somebody entered one, and there is a game
 * for it to describe. An added court can sit empty on both sides waiting for
 * players, and a score on that describes nothing.
 */
export function isScored(
  court: CourtAssignment
): court is CourtAssignment & { score: CourtScore } {
  return (
    court.score !== undefined &&
    court.team1.length > 0 &&
    court.team2.length > 0
  );
}

export function winnerOf(court: CourtAssignment): Side | null {
  return isScored(court) ? winnerOfScore(court.score) : null;
}

/** Whether anything in this session has been scored yet. */
export function hasAnyScore(schedule: Schedule): boolean {
  return schedule.rounds.some((round) => round.courts.some(isScored));
}

export interface StandingsRow {
  player: Player;
  wins: number;
  losses: number;
  /** Scored games. A draw counts here and in neither of the two above. */
  played: number;
  /** Points this player's side scored. The Points column. */
  pointsFor: number;
  /** Points conceded. Not a column of its own; it is what the diff is made of. */
  pointsAgainst: number;
  /** pointsFor less pointsAgainst. The Diff column. */
  differential: number;
}

function emptyRow(player: Player): StandingsRow {
  return {
    player,
    wins: 0,
    losses: 0,
    played: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    differential: 0,
  };
}

/**
 * The table, ranked.
 *
 * Everybody gets a row, including somebody who has sat out all afternoon: a name
 * missing from the standings reads as a fault, not as a zero.
 *
 * Rows are built from the players passed in *and* everybody standing on a scored
 * court, because a player who went home at half time is out of the session but
 * still in the rounds they played. Their games happened and the table should say
 * so. Where both have a copy the passed-in one wins, since it carries any
 * correction the host has made since.
 */
export function standings(schedule: Schedule, players: Player[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();

  for (const round of schedule.rounds) {
    for (const court of round.courts) {
      if (!isScored(court)) continue;
      for (const player of [...court.team1, ...court.team2]) {
        if (!rows.has(player.id)) rows.set(player.id, emptyRow(player));
      }
    }
  }
  for (const player of players) {
    const existing = rows.get(player.id);
    if (existing) existing.player = player;
    else rows.set(player.id, emptyRow(player));
  }

  for (const round of schedule.rounds) {
    for (const court of round.courts) {
      if (!isScored(court)) continue;
      const won = winnerOfScore(court.score);
      const sides: { side: Side; team: Player[]; own: number; other: number }[] = [
        { side: 'team1', team: court.team1, own: court.score.team1, other: court.score.team2 },
        { side: 'team2', team: court.team2, own: court.score.team2, other: court.score.team1 },
      ];
      for (const { side, team, own, other } of sides) {
        for (const player of team) {
          const row = rows.get(player.id);
          if (!row) continue;
          row.played += 1;
          row.pointsFor += own;
          row.pointsAgainst += other;
          row.differential += own - other;
          if (won === side) row.wins += 1;
          else if (won !== null) row.losses += 1;
        }
      }
    }
  }

  // Name is the last key rather than a flourish. Sort is stable, so without it
  // two identical rows fall back to the order players were passed in — which a
  // substitution reshuffles — and they would swap places on screen for no
  // reason anybody watching could see.
  return [...rows.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.differential - a.differential ||
      b.pointsFor - a.pointsFor ||
      a.player.name.localeCompare(b.player.name)
  );
}
