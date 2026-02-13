import { useState } from 'react';
import type { Player, Gender } from '../../types';
import { PlayerForm } from './PlayerForm';
import { PlayerList } from './PlayerList';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { corePlayers } from '../../data/corePlayers';

interface Props {
  players: Player[];
  onAdd: (name: string, rating: number, gender: Gender) => void;
  onUpdate: (id: string, updates: Partial<Omit<Player, 'id'>>) => void;
  onRemove: (id: string) => void;
  onContinue: () => void;
}

export function RosterPage({ players, onAdd, onUpdate, onRemove, onContinue }: Props) {
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [coreImported, setCoreImported] = useLocalStorage<boolean>('pb-core-imported', false);

  function handleSubmit(name: string, rating: number, gender: Gender) {
    if (editingPlayer) {
      onUpdate(editingPlayer.id, { name, rating, gender });
      setEditingPlayer(null);
    } else {
      onAdd(name, rating, gender);
    }
  }

  function handleImportCorePlayers() {
    for (const p of corePlayers) {
      onAdd(p.name, p.rating, p.gender);
    }
    setCoreImported(true);
  }

  return (
    <div className="space-y-6">
      {players.length >= 4 && (
        <div className="flex justify-end">
          <button
            onClick={onContinue}
            className="px-6 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
          >
            Continue to Setup &rarr;
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Add Player</h2>
        <PlayerForm onSubmit={handleSubmit} />
      </div>

      {editingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-md w-full">
            <h2 className="text-lg font-semibold mb-4">Edit Player</h2>
            <PlayerForm
              onSubmit={handleSubmit}
              editingPlayer={editingPlayer}
              onCancelEdit={() => setEditingPlayer(null)}
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            Player Roster ({players.length})
          </h2>
        </div>
        <PlayerList
          players={players}
          onEdit={setEditingPlayer}
          onRemove={onRemove}
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={onContinue}
          disabled={players.length < 4}
          className="px-6 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue to Setup &rarr;
        </button>
      </div>
      {players.length < 4 && players.length > 0 && (
        <p className="text-amber-600 text-sm text-right">
          Need at least 4 players to continue
        </p>
      )}

      {!coreImported && (
        <div className="text-center pt-2">
          <button
            onClick={handleImportCorePlayers}
            className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Import Core Players
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Will import the most common players, such as Susan, Jeff, Adonica, etc.
          </p>
        </div>
      )}

    </div>
  );
}
