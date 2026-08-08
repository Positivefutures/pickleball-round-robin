import { useCallback } from 'react';
import type { Player, Gender } from '../types';
import { useStoredValue } from './useStoredValue';
import { generateId } from '../utils/helpers';
import * as stores from '../lib/stores';
import { planImport } from '../lib/groupImport';
import type { ImportGroup } from '../lib/groupImport';

/**
 * One global pool of players. Roster membership lives on each player as
 * `rosterIds`, so the active roster's list is a filter over the pool rather
 * than a store of its own — a player may belong to any number of groups, and
 * sharding by group would have to write the same person into several places.
 */
export function usePlayers() {
  const [players, setPlayers] = useStoredValue(stores.players);

  const addPlayer = useCallback(
    (name: string, rating: number, gender: Gender, rosterIds: string[]) => {
      const newPlayer: Player = { id: generateId(), name, rating, gender, rosterIds };
      // Functional update, so rapid successive adds don't clobber each other
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

  /**
   * Loads every group of an imported file into the pool in one write. The plan
   * is worked out by planImport — see there for why all groups go together
   * rather than one call per group. Counts are computed against the current
   * pool, which nothing else is writing to mid-import, so they can be returned
   * synchronously.
   */
  const importGroups = useCallback(
    (groups: ImportGroup[]) => {
      const plan = planImport(players, groups, generateId);

      setPlayers((prev) => [
        ...prev.map((p) => {
          const extra = plan.links.get(p.id);
          return extra ? { ...p, rosterIds: Array.from(new Set([...p.rosterIds, ...extra])) } : p;
        }),
        ...plan.created,
      ]);

      return plan.counts;
    },
    [players, setPlayers]
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
    importGroups,
    removeFromRoster,
    deletePlayer,
    reassignRoster,
  };
}
