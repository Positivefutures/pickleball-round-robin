import type { Player, Roster } from '../../types';
import { CheckIcon, GroupSolidIcon } from '../icons';

interface Props {
  groups: Roster[];
  /** Every player in the app, so each group can show how many are in it. */
  players: Player[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Choosing which group you are working with.
 *
 * This was a native `<select>`, and the list a phone or a desktop browser opens
 * for one of those is the browser's, not ours: grey, no wider than the control
 * it came from, and animated to its own taste. Group names are long enough to
 * wrap in a box that narrow. So the list is drawn here instead, in the same
 * bordered card every other dialog in the app uses, with room for the name and
 * the size of the group beside it.
 */
export function GroupPicker({ groups, players, activeId, onSelect, onClose }: Props) {
  function countFor(rosterId: string) {
    return players.filter((p) => p.rosterIds.includes(rosterId)).length;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg border-[3px] border-[#444] shadow-lg p-6 mx-4 max-w-md w-full">
        {/* The same heading as the panel it was opened from, icon on the right
            in the shared heading grey. */}
        <h2 className="flex items-center gap-2 text-[1.35rem] font-extrabold text-[#222] mb-4">
          My Groups
          <GroupSolidIcon className="w-[30px] h-[30px] text-[#60697c]" />
        </h2>

        <div className="space-y-2 mb-5 max-h-72 overflow-y-auto">
          {groups.map((g) => {
            const current = g.id === activeId;
            const count = countFor(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelect(g.id)}
                // Not colour alone: the one you are in carries a tick as well.
                aria-current={current ? 'true' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-md border text-left transition-colors ${
                  current
                    ? 'border-green-600 bg-green-50'
                    : 'border-gray-300 bg-white hover:bg-gray-100'
                }`}
              >
                <span className="min-w-0 flex-1 text-lg font-bold text-[#222] break-words">
                  {g.name}
                </span>
                <span className="shrink-0 text-sm text-gray-500">
                  {count} player{count === 1 ? '' : 's'}
                </span>
                {/* The slot is there on every row, so one row carrying a tick
                    does not shunt its own count out of line with the rest. */}
                <span className="w-5 shrink-0">
                  {current && <CheckIcon className="w-5 h-5 text-green-700" />}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
