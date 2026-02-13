import { useState } from 'react';
import type { Player } from '../../types';

interface Props {
  players: Player[];
  onEdit: (player: Player) => void;
  onRemove: (id: string) => void;
}

export function PlayerList({ players, onEdit, onRemove }: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  if (players.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        No players added yet. Add players above to get started.
      </p>
    );
  }

  const confirmingPlayer = confirmingId ? players.find((p) => p.id === confirmingId) : null;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-2 px-2 text-sm font-semibold text-gray-600">
                Name
              </th>
              <th className="text-center py-2 px-1 text-sm font-semibold text-gray-600 w-12">
                Gender
              </th>
              <th className="text-center py-2 px-1 text-sm font-semibold text-gray-600 w-14">
                Rating
              </th>
              <th className="text-right py-2 px-2 text-sm font-semibold text-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {players
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((player) => (
                <tr
                  key={player.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-2 px-2 font-medium">{player.name}</td>
                  <td className="py-2 px-1 text-center text-sm text-gray-600">
                    {player.gender}
                  </td>
                  <td className="py-2 px-1 text-center">
                    <span className="inline-block bg-green-100 text-green-800 px-2 py-0.5 rounded text-sm font-medium">
                      {player.rating.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <button
                      onClick={() => onEdit(player)}
                      className="text-blue-600 hover:text-blue-800 text-sm mr-3 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmingId(player.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {confirmingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-sm w-full">
            <p className="text-gray-800 text-center font-medium mb-4">
              Remove {confirmingPlayer.name}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingId(null)}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRemove(confirmingPlayer.id);
                  setConfirmingId(null);
                }}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
