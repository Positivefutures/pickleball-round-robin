import { useEffect, useRef, useState } from 'react';
import type { Player } from '../../types';

interface Props {
  players: Player[];
  /** Every player in the app — used to read roster membership. */
  allPlayers: Player[];
  rosterName?: string;
  onEdit: (player: Player) => void;
  onRemove: (id: string) => void;
  /** Selection mode — when off, the table renders exactly as before. */
  selecting?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export function PlayerList({
  players,
  allPlayers,
  rosterName,
  onEdit,
  onRemove,
  selecting = false,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
}: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // The row whose Edit/Remove buttons are showing. At most one at a time.
  const [activeId, setActiveId] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const allSelected = players.length > 0 && selectedIds.length === players.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  // A partially-selected list would otherwise look identical to an empty one
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected, selecting]);

  // Multi-select mode owns the row tap, so the single-row buttons step aside.
  // Adjusted during render rather than in an effect — no second paint.
  const [prevSelecting, setPrevSelecting] = useState(selecting);
  if (selecting !== prevSelecting) {
    setPrevSelecting(selecting);
    if (activeId) setActiveId(null);
  }

  // Anything clicked outside the table — any other button on the page, or just
  // blank space — puts the row back to showing gender and rating. Clicks inside
  // the table are handled by the row itself.
  useEffect(() => {
    if (!activeId) return;
    function handlePointerDown(e: PointerEvent) {
      if (!tableRef.current?.contains(e.target as Node)) setActiveId(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [activeId]);

  // Players in several rosters just get dropped from this one after a light
  // confirm. Players in only this roster fall through to the parent, which
  // offers permanent deletion instead.
  function requestRemove(id: string) {
    const player = allPlayers.find((p) => p.id === id);
    if (player && player.rosterIds.length <= 1) {
      onRemove(id);
      return;
    }
    setConfirmingId(id);
  }

  if (players.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        No players in this group yet. Add players above to get started.
      </p>
    );
  }

  const confirmingPlayer = confirmingId ? players.find((p) => p.id === confirmingId) : null;

  return (
    <>
      <div ref={tableRef} className="overflow-x-auto">
        <table className="roster-table w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              {selecting && (
                <th className="py-2 pl-2 pr-1 w-8">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => onToggleSelectAll?.()}
                    aria-label="Select all players"
                    className="w-4 h-4 accent-green-600 align-middle"
                  />
                </th>
              )}
              <th className="text-left py-2 px-2 text-[1.05rem] font-semibold text-gray-600">
                Name
              </th>
              <th className="col-gender text-center py-2 px-1 text-[1.05rem] font-semibold text-gray-600 w-16">
                Gender
              </th>
              <th className="col-rating text-center py-2 px-1 text-[1.05rem] font-semibold text-gray-600 w-20">
                Rating
              </th>
            </tr>
          </thead>
          <tbody>
            {players
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((player) => {
                const isActive = !selecting && activeId === player.id;
                return (
                  <tr
                    key={player.id}
                    // The row is the tap target: while selecting it toggles the
                    // checkbox, otherwise it swaps gender/rating for the buttons.
                    // Tapping a different row moves the buttons there.
                    onClick={
                      selecting
                        ? () => onToggleSelect?.(player.id)
                        : () => setActiveId(isActive ? null : player.id)
                    }
                    className={`border-b border-gray-100 cursor-pointer ${
                      isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
                    } ${selecting && selectedIds.includes(player.id) ? 'bg-green-50' : ''}`}
                  >
                    {selecting && (
                      <td className="py-3 pl-2 pr-1">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(player.id)}
                          onChange={() => onToggleSelect?.(player.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${player.name}`}
                          className="w-4 h-4 accent-green-600 align-middle"
                        />
                      </td>
                    )}
                    <td className="py-3 px-2 font-medium">{player.name}</td>
                    {isActive ? (
                      <td colSpan={2} className="py-1.5 px-1 whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveId(null);
                              onEdit(player);
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveId(null);
                              requestRemove(player.id);
                            }}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="col-gender py-3 px-1 text-center text-sm text-gray-600">
                          {player.gender}
                        </td>
                        <td className="col-rating py-3 px-1 text-center">
                          <span className="rating-badge inline-block bg-green-100 text-green-800 px-2 py-0.5 rounded text-sm font-medium">
                            {player.rating.toFixed(1)}
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {confirmingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-sm w-full">
            <p className="text-gray-800 text-center font-medium mb-2">
              Remove {confirmingPlayer.name} from {rosterName ?? 'this group'}?
            </p>
            <p className="text-sm text-gray-600 text-center mb-4">
              They&rsquo;ll stay in their other groups.
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
