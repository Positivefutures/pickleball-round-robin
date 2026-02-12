import { useCallback } from 'react';
import type { Player, Gender } from '../types';
import { useLocalStorage } from './useLocalStorage';
import { generateId } from '../utils/helpers';

export function usePlayers() {
  const [players, setPlayers] = useLocalStorage<Player[]>('pb-roster', []);

  const addPlayer = useCallback(
    (name: string, rating: number, gender: Gender) => {
      const newPlayer: Player = { id: generateId(), name, rating, gender };
      setPlayers((prev) => [...prev, newPlayer]);
    },
    [setPlayers]
  );

  const updatePlayer = useCallback(
    (id: string, updates: Partial<Omit<Player, 'id'>>) => {
      setPlayers((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    [setPlayers]
  );

  const removePlayer = useCallback(
    (id: string) => {
      setPlayers((prev) => prev.filter((p) => p.id !== id));
    },
    [setPlayers]
  );

  return { players, addPlayer, updatePlayer, removePlayer };
}
