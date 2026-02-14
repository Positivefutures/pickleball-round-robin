import type { Player, PairingHistory } from '../types';

export function determineSitOuts(
  players: Player[],
  numCourts: number,
  history: PairingHistory,
  excludeIds?: Set<string>,
  previousSitOutIds?: Set<string>
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

  const sorted = [...candidates].sort((a, b) => {
    const aPlayed = history.gamesPlayed[a.id] ?? 0;
    const bPlayed = history.gamesPlayed[b.id] ?? 0;
    if (bPlayed !== aPlayed) return bPlayed - aPlayed;

    // Avoid consecutive sit-outs: prefer sitting out players who did NOT sit out last round
    if (previousSitOutIds) {
      const aPrev = previousSitOutIds.has(a.id) ? 1 : 0;
      const bPrev = previousSitOutIds.has(b.id) ? 1 : 0;
      if (aPrev !== bPrev) return aPrev - bPrev; // non-previous first
    }

    return Math.random() - 0.5;
  });

  return sorted.slice(0, numSitOuts);
}
