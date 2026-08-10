export function fisherYatesShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sumRatings(players: { rating: number }[]): number {
  return players.reduce((sum, p) => sum + p.rating, 0);
}

/**
 * How far apart the two sides of a court are.
 *
 * Two even sides are compared by their totals, which is what every court was
 * before some of them could be short. A 2v1 cannot be read that way — two
 * ratings added always tower over one, and the number comes out around 3.5 on
 * even the closest game. So sides of different sizes are averaged instead, which
 * puts a 2v1 back on the same scale as everything else.
 *
 * This is not only what the badge would say. The solver caps a court at 0.5 and
 * penalises heavily past it, and a raw sum blew through that cap on every short
 * court ever built.
 */
export function courtRatingDiff(
  team1: { rating: number }[],
  team2: { rating: number }[]
): number {
  const a = sumRatings(team1);
  const b = sumRatings(team2);
  if (team1.length !== team2.length && team1.length > 0 && team2.length > 0) {
    return Math.abs(a / team1.length - b / team2.length);
  }
  return Math.abs(a - b);
}

// The schedule shows each player's full entered name verbatim (e.g. "Jeff B",
// "Becky P", or a full last name) — never just the first name. The second
// argument is retained so existing call sites don't need to change; it is no
// longer consulted now that names are never abbreviated.
export function getDisplayName(player: { name: string }, allPlayers?: unknown): string {
  void allPlayers;
  return player.name;
}

/**
 * One side of a court, as the printed sheet and the PDF write it.
 *
 * A court of three carries its missing place through to paper as EMPTY. Without
 * it the sheet shows a lone name against a pair and reads as a mistake, and the
 * people standing there have no way to know it was meant.
 */
export function formatTeam(
  team: { name: string }[],
  court: { team1: unknown[]; team2: unknown[] }
): string {
  const names = team.map((p) => p.name);
  if (court.team1.length + court.team2.length === 3 && team.length === 1) {
    names.push('EMPTY');
  }
  return names.join(' & ');
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}
