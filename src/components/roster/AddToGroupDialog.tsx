import { useState } from 'react';
import type { Roster } from '../../types';

interface Props {
  playerCount: number;
  /** Groups the players can be added to — the active group is excluded by the caller. */
  groups: Roster[];
  onConfirm: (rosterIds: string[]) => void;
  onCancel: () => void;
}

export function AddToGroupDialog({ playerCount, groups, onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState<string[]>([]);

  function toggle(id: string) {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-sm w-full">
        <h2 className="text-lg font-semibold mb-1">
          Add {playerCount} player{playerCount === 1 ? '' : 's'} to&hellip;
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          They&rsquo;ll stay in this group as well.
        </p>

        <div className="space-y-1 max-h-56 overflow-y-auto mb-5">
          {groups.map((g) => (
            <label
              key={g.id}
              className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-0.5"
            >
              <input
                type="checkbox"
                checked={checked.includes(g.id)}
                onChange={() => toggle(g.id)}
                className="w-4 h-4 accent-green-600"
              />
              {g.name}
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(checked)}
            disabled={checked.length === 0}
            className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
