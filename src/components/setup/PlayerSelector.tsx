import { Fragment, useEffect, useState } from 'react';
import type { Player } from '../../types';
import { LinkIcon } from '../icons';
import { SpotsFilled } from './SpotsFilled';

interface Props {
  players: Player[];
  /** Standing couples among the selected. Their halves trade the checkbox for a link. */
  pairs: { p1: Player; p2: Player }[];
  selectedIds: string[];
  /** Only to work out how many places there are to fill. */
  numCourts: number;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function PlayerSelector({
  players,
  pairs,
  selectedIds,
  numCourts,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: Props) {
  const pairedIds = new Set(pairs.flatMap((pr) => [pr.p1.id, pr.p2.id]));
  /**
   * The linked box last tapped, which is where the why-not note sits. The
   * same box tapped again, or a tap anywhere else, clears it: the note is an
   * answer to one press, not a state of the page. Checked against pairedIds
   * before use, so breaking the link in the panel above takes the note with
   * it.
   */
  const [hintFor, setHintFor] = useState<string | null>(null);
  const hintId = hintFor && pairedIds.has(hintFor) ? hintFor : null;
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!hintFor) return;
    const hide = () => setHintFor(null);
    document.addEventListener('click', hide);
    return () => document.removeEventListener('click', hide);
  }, [hintFor]);

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
          // A linked player keeps their alphabetical seat, in the couple's
          // colours, with the link where the checkbox was. The box cannot be
          // ticked or unticked — the Partners panel above is where a couple
          // is broken — and a tap that tries anyway is told so, under the
          // row it landed on.
          if (pairedIds.has(player.id)) {
            return (
              <Fragment key={player.id}>
                <button
                  type="button"
                  onClick={(e) => {
                    // Kept from the listener that hides the note, or moving
                    // it from one linked box to another would hide and show
                    // in the same press.
                    e.stopPropagation();
                    setHintFor((cur) => (cur === player.id ? null : player.id));
                  }}
                  className="flex items-center gap-2 p-2.5 rounded-md border border-indigo-300 bg-indigo-50 text-left"
                >
                  <span className="text-indigo-500 shrink-0">
                    <LinkIcon className="w-4 h-4" />
                  </span>
                  <span className="font-medium text-sm truncate">{player.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{player.gender}</span>
                  <span className="text-xs text-gray-500">
                    {player.rating.toFixed(1)}
                  </span>
                </button>
                {hintId === player.id && (
                  <p className="col-span-full text-sm text-indigo-700">
                    Unlink partner above to uncheck them
                  </p>
                )}
              </Fragment>
            );
          }
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
