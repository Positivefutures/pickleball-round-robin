import { useCallback } from 'react';
import type { Player, Gender } from '../types';
import { useLocalStorage } from './useLocalStorage';
import { generateId } from '../utils/helpers';
import { KEYS } from '../lib/migrations';

/**
 * One global pool of players. Roster membership lives on each player as
 * `rosterIds`, so the active roster's list is a filter rather than a separate
 * storage key — useLocalStorage can't re-read when its key changes, so sharding
 * per roster would render one roster's data while writing to another's.
 */
export function usePlayers() {
  const [players, setPlayers] = useLocalStorage<Player[]>(KEYS.players, []);

  const addPlayer = useCallback(
    (name: string, rating: number, gender: Gender, rosterIds: string[]) => {
      const newPlayer: Player = { id: generateId(), name, rating, gender, rosterIds };
      // Functional update: the core-players import calls this 28 times in one tick
      setPlayers((prev) => [...prev, newPlayer]);
    },
    [setPlayers]
  );

  const updatePlayer = useCallback(
    (id: string, updates: Partial<Omit<Player, 'id'>>) => {
      setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    },
    [setPlayers]
  );

  const setPlayerRosters = useCallback(
    (id: string, rosterIds: string[]) => {
      setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, rosterIds } : p)));
    },
    [setPlayers]
  );

  const removeFromRoster = useCallback(
    (playerId: string, rosterId: string) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, rosterIds: p.rosterIds.filter((r) => r !== rosterId) } : p
        )
      );
    },
    [setPlayers]
  );

  /** Permanent — drops the player from every roster and from the pool. */
  const deletePlayer = useCallback(
    (id: string) => {
      setPlayers((prev) => prev.filter((p) => p.id !== id));
    },
    [setPlayers]
  );

  /**
   * Adds several players to several groups in one write. The Set union means a
   * player already in a target group is left untouched rather than duplicated.
   */
  const addPlayersToRosters = useCallback(
    (playerIds: string[], rosterIds: string[]) => {
      const targets = new Set(playerIds);
      setPlayers((prev) =>
        prev.map((p) =>
          targets.has(p.id)
            ? { ...p, rosterIds: Array.from(new Set([...p.rosterIds, ...rosterIds])) }
            : p
        )
      );
    },
    [setPlayers]
  );

  /** Bulk membership rewrite, used when a roster is deleted. */
  const reassignRoster = useCallback(
    (fromRosterId: string, toRosterId: string | null) => {
      setPlayers((prev) =>
        prev.flatMap((p) => {
          if (!p.rosterIds.includes(fromRosterId)) return [p];
          const remaining = p.rosterIds.filter((r) => r !== fromRosterId);
          if (remaining.length > 0) return [{ ...p, rosterIds: remaining }];
          // Was only in the deleted roster: move it, or drop the player entirely
          if (toRosterId === null) return [];
          return [{ ...p, rosterIds: [toRosterId] }];
        })
      );
    },
    [setPlayers]
  );

  return {
    players,
    addPlayer,
    updatePlayer,
    setPlayerRosters,
    addPlayersToRosters,
    removeFromRoster,
    deletePlayer,
    reassignRoster,
  };
}
