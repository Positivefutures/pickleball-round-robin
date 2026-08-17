import { useState } from 'react';
import type { Roster } from '../../types';
import { GroupSolidIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';

interface Props {
  playerCount: number;
  /** Groups the players can be added to — the active group is excluded by the caller. */
  groups: Roster[];
  /** Makes a group from here, and hands it back so it can be ticked at once. */
  onCreateGroup: (name: string) => Roster;
  onConfirm: (rosterIds: string[]) => void;
  onCancel: () => void;
}

export function AddToGroupDialog({
  playerCount,
  groups,
  onCreateGroup,
  onConfirm,
  onCancel,
}: Props) {
  const [checked, setChecked] = useState<string[]>([]);
  const [newName, setNewName] = useState('');

  function toggle(id: string) {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Somebody with one group has nowhere to send anyone, and being told to go and
  // make a group somewhere else is a dead end on a dialog they opened to do one
  // thing. The new group arrives ticked, so Save is the very next press.
  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const created = onCreateGroup(trimmed);
    setChecked((prev) => [...prev, created.id]);
    setNewName('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={`bg-white ${panelCard} p-6 mx-4 max-w-sm w-full`}>
        <PanelHeading
          icon={GroupSolidIcon}
          title={`Add ${playerCount} player${playerCount === 1 ? '' : 's'} to…`}
        />
        {/* Not "this group as well": with Show All Players on, the ticked people
            may not be in the group you are looking at. */}
        <p className="mt-1 mb-4 text-center text-sm text-gray-600">
          They&rsquo;ll stay in the groups they&rsquo;re already in.
        </p>

        {groups.length === 0 ? (
          <p className="text-sm text-gray-600 mb-3">
            This is your only group. Name a second one to add them to.
          </p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto mb-3">
            {groups.map((g) => (
              <label
                key={g.id}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-0.5"
              >
                <input
                  type="checkbox"
                  checked={checked.includes(g.id)}
                  onChange={() => toggle(g.id)}
                  className="w-4 h-4 accent-brand-teal"
                />
                {g.name}
              </label>
            ))}
          </div>
        )}

        {/* Its own form, so Enter in the field makes the group rather than
            submitting whatever button the browser finds first. */}
        <form onSubmit={handleCreate} className="flex gap-2 mb-5">
          <input
            type="text"
            value={newName}
            autoFocus={groups.length === 0}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New group name"
            aria-label="New group name"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="shrink-0 px-4 py-2 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </form>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(checked)}
            disabled={checked.length === 0}
            className="flex-1 px-4 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
