import { useState } from 'react';
import type { Player } from '../../types';
import { getDisplayName } from '../../utils/helpers';

interface Props {
  /** Group members not already in the session, filtered by the caller. */
  candidates: Player[];
  /** Everyone on the roster — for telling two players with the same first name apart. */
  allPlayers: Player[];
  onConfirm: (playerId: string) => void;
  onCancel: () => void;
}

export function AddPlayerDialog({ candidates, allPlayers, onConfirm, onCancel }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const empty = candidates.length === 0;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      {/* A column so the name list, and only the name list, takes whatever height
          is left over — the note and the buttons stay put while it scrolls. */}
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-sm flex-col rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="shrink-0 text-lg font-semibold text-gray-800">Add Player to Session</h2>

        {empty ? (
          <p className="mt-3 text-sm text-gray-600">
            Everyone in this group is already in the session. To play with someone new, add
            them to the group first from My Groups.
          </p>
        ) : (
          <>
            <p className="mt-2 shrink-0 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              They&rsquo;ll start <strong className="font-semibold">sitting out</strong> every
              round you haven&rsquo;t played yet. To get them on a court, swap them with
              another player, or tap Reshuffle to rebuild the remaining rounds with them
              mixed in.
            </p>

            {/* min-h-0 so this can shrink below its content and scroll, rather
                than pushing the buttons off the bottom of the dialog. */}
            <div className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
              {candidates.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                    selectedId === p.id ? 'bg-green-50 text-green-900' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="add-player"
                    checked={selectedId === p.id}
                    onChange={() => setSelectedId(p.id)}
                    className="h-4 w-4 accent-green-600"
                  />
                  <span className="font-medium">{getDisplayName(p, allPlayers)}</span>
                  <span className="ml-auto text-gray-500">{p.rating.toFixed(1)}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="mt-5 flex shrink-0 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
          >
            {empty ? 'Close' : 'Cancel'}
          </button>
          {!empty && (
            <button
              type="button"
              onClick={() => selectedId && onConfirm(selectedId)}
              disabled={!selectedId}
              className="flex-1 rounded-md bg-green-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Player
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
