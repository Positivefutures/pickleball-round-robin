import { useRef, useState } from 'react';
import type { Player, Roster } from '../../types';

interface Props {
  rosters: Roster[];
  players: Player[];
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  /** `moveTo` is a roster id to relocate exclusive players, or null to delete them. */
  onDelete: (id: string, moveTo: string | null) => void;
  onClose: () => void;
}

export function ManageRostersModal({
  rosters,
  players,
  onAdd,
  onRename,
  onDelete,
  onClose,
}: Props) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState<Roster | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);

  // Players who would be left with no roster at all if this one goes away
  const exclusivePlayers = confirmingDelete
    ? players.filter(
        (p) => p.rosterIds.length === 1 && p.rosterIds[0] === confirmingDelete.id
      )
    : [];
  const moveTarget = confirmingDelete
    ? rosters.find((r) => r.id !== confirmingDelete.id)
    : undefined;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewName('');
    // Keep the caret in the field so several groups can be added in a row
    newNameRef.current?.focus();
  }

  function commitRename() {
    if (editingId && editingName.trim()) onRename(editingId, editingName);
    setEditingId(null);
    setEditingName('');
  }

  function countFor(rosterId: string) {
    return players.filter((p) => p.rosterIds.includes(rosterId)).length;
  }

  if (confirmingDelete) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-sm w-full">
          <p className="text-gray-800 text-center font-medium mb-2">
            Delete &ldquo;{confirmingDelete.name}&rdquo;?
          </p>
          {exclusivePlayers.length > 0 ? (
            <p className="text-sm text-gray-600 mb-4">
              {exclusivePlayers.length} player{exclusivePlayers.length === 1 ? ' is' : 's are'} only
              in this group. Move {exclusivePlayers.length === 1 ? 'them' : 'them'} to{' '}
              <span className="font-medium">{moveTarget?.name}</span>, or delete{' '}
              {exclusivePlayers.length === 1 ? 'them' : 'them'} too?
            </p>
          ) : (
            <p className="text-sm text-gray-600 mb-4">
              Every player in it also belongs to another group, so no one will be lost.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {exclusivePlayers.length > 0 && moveTarget && (
              <button
                onClick={() => {
                  onDelete(confirmingDelete.id, moveTarget.id);
                  setConfirmingDelete(null);
                }}
                className="w-full px-4 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
              >
                Move to {moveTarget.name}
              </button>
            )}
            <button
              onClick={() => {
                onDelete(confirmingDelete.id, null);
                setConfirmingDelete(null);
              }}
              className="w-full px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
            >
              {exclusivePlayers.length > 0
                ? `Delete group and ${exclusivePlayers.length} player${
                    exclusivePlayers.length === 1 ? '' : 's'
                  }`
                : 'Delete group'}
            </button>
            <button
              onClick={() => setConfirmingDelete(null)}
              className="w-full px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-md w-full">
        <h2 className="text-lg font-semibold mb-4">Manage Groups</h2>

        <div className="space-y-2 mb-5 max-h-72 overflow-y-auto">
          {rosters.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              {editingId === r.id ? (
                <>
                  <input
                    type="text"
                    value={editingName}
                    autoFocus
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                      if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={commitRename}
                    className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-gray-800">
                    {r.name}
                    <span className="text-gray-400 text-sm ml-2">({countFor(r.id)})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { setEditingId(r.id); setEditingName(r.name); }}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={rosters.length <= 1}
                    title={rosters.length <= 1 ? 'You need at least one group' : undefined}
                    onClick={() => setConfirmingDelete(r)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium disabled:text-gray-300 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleAdd} className="flex gap-2 mb-5">
          <input
            ref={newNameRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New group name"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
          >
            Add
          </button>
        </form>

        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );
}
