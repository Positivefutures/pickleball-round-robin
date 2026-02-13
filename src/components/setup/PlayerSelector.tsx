import type { Player } from '../../types';

interface Props {
  players: Player[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function PlayerSelector({
  players,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: Props) {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-medium text-gray-700">
          Select Players ({selectedIds.length} of {players.length})
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-sm text-green-600 hover:text-green-800 font-medium"
          >
            Select All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={onDeselectAll}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Deselect All
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sorted.map((player) => {
          const isSelected = selectedIds.includes(player.id);
          return (
            <label
              key={player.id}
              className={`flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-green-50 border-green-300'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(player.id)}
                className="rounded text-green-600 focus:ring-green-500"
              />
              <span className="font-medium text-sm">{player.name}</span>
              <span className="text-xs text-gray-400">{player.gender}</span>
              <span className="text-xs text-gray-500 ml-auto">
                {player.rating.toFixed(1)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
