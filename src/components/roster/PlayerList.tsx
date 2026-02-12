import type { Player } from '../../types';

interface Props {
  players: Player[];
  onEdit: (player: Player) => void;
  onRemove: (id: string) => void;
}

export function PlayerList({ players, onEdit, onRemove }: Props) {
  if (players.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        No players added yet. Add players above to get started.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">
              Name
            </th>
            <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600 w-16">
              Gender
            </th>
            <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600 w-24">
              Rating
            </th>
            <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600 w-32">
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
                <td className="py-2 px-3 font-medium">{player.name}</td>
                <td className="py-2 px-3 text-center text-sm text-gray-600">
                  {player.gender}
                </td>
                <td className="py-2 px-3 text-center">
                  <span className="inline-block bg-green-100 text-green-800 px-2 py-0.5 rounded text-sm font-medium">
                    {player.rating.toFixed(1)}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <button
                    onClick={() => onEdit(player)}
                    className="text-blue-600 hover:text-blue-800 text-sm mr-3 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onRemove(player.id)}
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
  );
}
