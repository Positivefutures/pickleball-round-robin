import type { Player, PairingHistory, Partnership } from '../types';

// A sit-out candidate unit: a single player, or a fixed pair that must sit
// together. Partnered players are never split across the sit-out line.
interface SitOutUnit {
  players: Player[];
  avgGames: number;
  prevSat: boolean; // any member sat out the previous round
}

export function determineSitOuts(
  players: Player[],
  numCourts: number,
  history: PairingHistory,
  excludeIds?: Set<string>,
  previousSitOutIds?: Set<string>,
  partnerships?: Partnership[]
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

      return Math.random() - 0.5;
    });

    return sorted.slice(0, numSitOuts);
  }

  // Partnership-aware: build sit-out units so couples sit together. Because a
  // court is always 4 players, the active count after sitting out is exactly
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
    });
  }

  // Everyone else is a single unit.
  for (const p of candidates) {
    if (claimed.has(p.id)) continue;
    units.push({ players: [p], avgGames: games(p), prevSat: sat(p) });
  }

  // Highest games-played sits first; avoid back-to-back sit-outs; random tie-break.
  units.sort((a, b) => {
    if (b.avgGames !== a.avgGames) return b.avgGames - a.avgGames;
    if (a.prevSat !== b.prevSat) return (a.prevSat ? 1 : 0) - (b.prevSat ? 1 : 0);
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
