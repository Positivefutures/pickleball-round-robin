import { Fragment } from 'react';
import type { Player } from '../../types';
import { LinkIcon } from '../icons';
import { SpotsFilled } from './SpotsFilled';

interface Props {
  players: Player[];
  /** Standing couples among the selected, drawn at the head of the grid. */
  pairs: { p1: Player; p2: Player }[];
  selectedIds: string[];
  /** Only to work out how many places there are to fill. */
  numCourts: number;
  onToggle: (id: string) => void;
  /**
   * A paired player's box, unticked. The couple is broken and both drop back
   * into the list below — the one tapped unticked, the other still in.
   */
  onUnpairTick: (id1: string, id2: string, tapped: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function PlayerSelector({
  players,
  pairs,
  selectedIds,
  numCourts,
  onToggle,
  onUnpairTick,
  onSelectAll,
  onDeselectAll,
}: Props) {
  const pairedIds = new Set(pairs.flatMap((pr) => [pr.p1.id, pr.p2.id]));
  const sorted = players
    .filter((p) => !pairedIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

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
        {/* Couples first, each as one cell in the Partners panel's colours, so
            a box counted in the number above is always a box on this grid.
            Names only: two of everything else would not fit the width, and the
            couple's own panel above already reads the same way. */}
        {pairs.map(({ p1, p2 }) => (
          <div
            key={`${p1.id}|${p2.id}`}
            className="col-span-2 flex items-center gap-2 p-2.5 rounded-md border border-indigo-300 bg-indigo-50"
          >
            {[p1, p2].map((member, i) => (
              <Fragment key={member.id}>
                {i === 1 && (
                  <span className="text-indigo-500 shrink-0">
                    <LinkIcon className="w-4 h-4" />
                  </span>
                )}
                <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => onUnpairTick(p1.id, p2.id, member.id)}
                    className="accent-brand-teal"
                  />
                  <span className="font-medium text-sm truncate">{member.name}</span>
                </label>
              </Fragment>
            ))}
          </div>
        ))}
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
