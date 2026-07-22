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

// The schedule shows each player's full entered name verbatim (e.g. "Jeff B",
// "Becky P", or a full last name) — never just the first name. The second
// argument is retained so existing call sites don't need to change; it is no
// longer consulted now that names are never abbreviated.
export function getDisplayName(player: { name: string }, allPlayers?: unknown): string {
  void allPlayers;
  return player.name;
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}
