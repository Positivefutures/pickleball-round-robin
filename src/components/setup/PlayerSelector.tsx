import type { Player } from '../../types';
import { SpotsFilled } from './SpotsFilled';

interface Props {
  players: Player[];
  selectedIds: string[];
  /** Only to work out how many places there are to fill. */
  numCourts: number;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function PlayerSelector({
  players,
  selectedIds,
  numCourts,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: Props) {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-[1.35rem] font-extrabold text-[#222]">
          Select Players
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-sm text-brand-teal hover:text-brand-teal-dark font-bold"
          >
            Select All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={onDeselectAll}
            className="text-sm text-gray-500 hover:text-gray-700 font-bold"
          >
            Deselect All
          </button>
        </div>
      </div>
      {/* Under the heading and over the grid, so the count and the ticks that
          change it are the same glance. */}
      <div className="mb-4">
        <SpotsFilled numPlayers={selectedIds.length} numCourts={numCourts} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sorted.map((player) => {
          const isSelected = selectedIds.includes(player.id);
          return (
            <label
              key={player.id}
              className={`flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-brand-teal-light border-brand-teal'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(player.id)}
                className="accent-brand-teal"
              />
              <span className="font-medium text-sm">{player.name}</span>
              {/* Gender and rating travel together on the right. Beside the name
                  they read as part of it, and no two rows lined them up. */}
              <span className="text-xs text-gray-400 ml-auto">{player.gender}</span>
              <span className="text-xs text-gray-500">
                {player.rating.toFixed(1)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
