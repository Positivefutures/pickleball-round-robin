import { useEffect, useRef } from 'react';
import type { Player } from '../../types';
import { PencilIcon } from '../icons';

interface Props {
  players: Player[];
  onEdit: (player: Player) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

/**
 * The group's players, one per row, always tickable.
 *
 * The checkboxes used to appear only after a Select Players button was pressed,
 * and a row tap meant two different things depending on whether that had
 * happened. Now the row tap only ever ticks the box, and the one thing it used
 * to reveal — a way in to a player — is a pencil sitting on every row instead.
 * Removing somebody is the panel's job now, not a row's.
 */
export function PlayerList({
  players,
  onEdit,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: Props) {
  const selectAllRef = useRef<HTMLInputElement>(null);

  const allSelected = players.length > 0 && selectedIds.length === players.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  // A partially-selected list would otherwise look identical to an empty one
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  // No empty case here: RosterPage swaps the whole panel for its own empty
  // state before this ever renders with an empty list.

  return (
    <div className="overflow-x-auto">
      <table className="roster-table w-full">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="py-2 pl-2 pr-1 w-8">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label="Select all players"
                className="w-4 h-4 accent-brand-teal align-middle"
              />
            </th>
            <th className="text-left py-2 px-2 text-[1.05rem] font-semibold text-gray-600">
              Name
            </th>
            <th className="col-gender text-center py-2 px-1 text-[1.05rem] font-semibold text-gray-600 w-16">
              Gender
            </th>
            <th className="col-rating text-center py-2 px-1 text-[1.05rem] font-semibold text-gray-600 w-20">
              Rating
            </th>
            {/* The pencils below say what they are, each naming its own player */}
            <th className="w-11" />
          </tr>
        </thead>
        <tbody>
          {players
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((player) => (
              <tr
                key={player.id}
                // The row is the tap target, so the box is reachable without
                // aiming at it. The pencil stops the event before it gets here.
                onClick={() => onToggleSelect(player.id)}
                className={`border-b border-gray-100 cursor-pointer ${
                  selectedIds.includes(player.id)
                    ? 'bg-brand-teal-light'
                    : 'hover:bg-gray-50'
                }`}
              >
                <td className="py-3 pl-2 pr-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(player.id)}
                    onChange={() => onToggleSelect(player.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${player.name}`}
                    className="w-4 h-4 accent-brand-teal align-middle"
                  />
                </td>
                {/* max-w-0 makes this the column that yields. The other four are
                    fixed, so a long name is cut here rather than pushing the
                    pencil off the side of a phone. */}
                <td className="py-3 px-2 font-medium max-w-0">
                  <div className="truncate" title={player.name}>
                    {player.name}
                  </div>
                </td>
                <td className="col-gender py-3 px-1 text-center text-sm text-gray-600">
                  {player.gender}
                </td>
                <td className="col-rating py-3 px-1 text-center">
                  <span className="rating-badge inline-block bg-brand-teal-light text-black border border-brand-teal px-2 py-0.5 rounded text-sm font-medium">
                    {player.rating.toFixed(1)}
                  </span>
                </td>
                {/* White on a border, as the pencil on the schedule and the one
                    in Manage Groups are. The row is a name and one way in, and a
                    tinted button would read as the thing to press. */}
                <td className="py-2 pl-1 pr-2 w-11">
                  <button
                    type="button"
                    aria-label={`Edit ${player.name}`}
                    title={`Edit ${player.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(player);
                    }}
                    className="flex shrink-0 items-center rounded-md border border-gray-400 bg-white px-2 py-1.5 text-gray-700 shadow-sm transition-colors hover:bg-gray-100"
                  >
                    <PencilIcon className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
