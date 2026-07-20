import { useCallback } from 'react';
import type { Roster } from '../types';
import { useLocalStorage } from './useLocalStorage';
import { generateId } from '../utils/helpers';
import { KEYS, DEFAULT_ROSTER_NAME } from '../lib/migrations';

export function useRosters() {
  // runMigrations() guarantees at least one roster and a valid active id
  const [rosters, setRosters] = useLocalStorage<Roster[]>(KEYS.rosters, [
    { id: 'default', name: DEFAULT_ROSTER_NAME },
  ]);
  const [activeRosterId, setActiveRosterId] = useLocalStorage<string>(
    KEYS.activeRoster,
    rosters[0]?.id ?? 'default'
  );

  const addRoster = useCallback(
    (name: string) => {
      const roster: Roster = { id: generateId(), name: name.trim() };
      setRosters((prev) => [...prev, roster]);
      return roster;
    },
    [setRosters]
  );

  const renameRoster = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setRosters((prev) => prev.map((r) => (r.id === id ? { ...r, name: trimmed } : r)));
    },
    [setRosters]
  );

  // Callers are responsible for relocating or deleting the roster's players
  // first; this only removes the roster itself. The last roster can't be deleted.
  const deleteRoster = useCallback(
    (id: string) => {
      if (rosters.length <= 1) return;
      const next = rosters.filter((r) => r.id !== id);
      setRosters(next);
      if (activeRosterId === id) setActiveRosterId(next[0].id);
    },
    [rosters, activeRosterId, setRosters, setActiveRosterId]
  );

  const activeRoster = rosters.find((r) => r.id === activeRosterId) ?? rosters[0];

  return {
    rosters,
    activeRosterId: activeRoster?.id ?? activeRosterId,
    activeRoster,
    setActiveRosterId,
    addRoster,
    renameRoster,
    deleteRoster,
  };
}
