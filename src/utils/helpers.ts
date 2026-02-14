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

export function getDisplayName(player: { name: string }, allPlayers: { name: string }[]): string {
  const lastSpace = player.name.lastIndexOf(' ');
  if (lastSpace === -1) return player.name;
  const firstName = player.name.substring(0, lastSpace);
  const hasDuplicate = allPlayers.some(
    (p) => p !== player && p.name.substring(0, p.name.lastIndexOf(' ')) === firstName
  );
  return hasDuplicate ? player.name : firstName;
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}
