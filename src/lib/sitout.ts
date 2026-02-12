import type { Player, PairingHistory } from '../types';

export function determineSitOuts(
  players: Player[],
  numCourts: number,
  history: PairingHistory
): Player[] {
  const maxActive = numCourts * 4;
  if (players.length <= maxActive) {
    return [];
  }

  const numSitOuts = players.length - maxActive;

  const sorted = [...players].sort((a, b) => {
    const aPlayed = history.gamesPlayed[a.id] ?? 0;
    const bPlayed = history.gamesPlayed[b.id] ?? 0;
    if (bPlayed !== aPlayed) return bPlayed - aPlayed;
    return Math.random() - 0.5;
  });

  return sorted.slice(0, numSitOuts);
}
