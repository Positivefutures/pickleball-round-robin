import { useRef, useState } from 'react';
import type { Player, Roster } from '../../types';
import { CopyIcon, GroupSolidIcon, PencilIcon, TrashIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';

interface Props {
  rosters: Roster[];
  players: Player[];
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  /** `moveTo` is a roster id to relocate exclusive players, or null to delete them. */
  onDelete: (id: string, moveTo: string | null) => void;
  /**
   * A second group holding the same people. Nobody is copied: a player belongs
   * to any number of groups, so they simply belong to both from here on.
   */
  onDuplicate: (id: string, name: string) => void;
  onClose: () => void;
}

// The three buttons this panel has, written once. Six of them appear across the
// three screens below, and a red Delete that is a different red from the last
// red Delete is the kind of thing nobody notices until it is pointed out.
const PRIMARY =
  'px-4 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const GREY =
  'px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const DANGER =
  'px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed';

const FIELD =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';

/** Both icon buttons in the edit block wear their icon the same way. */
const WITH_ICON = 'flex items-center justify-center gap-2';

/**
 * Renaming, duplicating and deleting groups.
 *
 * One pencil per row rather than a pair of buttons. Rename and Delete sat side
 * by side on every row, which put a red button that ends a group next to a
 * routine one on a list that is scrolled with a thumb. Now nothing destructive
 * is reachable until a group has been opened for editing.
 */
export function ManageRostersModal({
  rosters,
  players,
  onAdd,
  onRename,
  onDelete,
  onDuplicate,
  onClose,
}: Props) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState<Roster | null>(null);
  const [duplicating, setDuplicating] = useState<Roster | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  /** Where the stranded players go. Set when the Delete panel opens. */
  const [moveTo, setMoveTo] = useState('');
  const newNameRef = useRef<HTMLInputElement>(null);

  // Players who would be left with no group at all if this one went away.
  const stranded = confirmingDelete
    ? players.filter(
        (p) => p.rosterIds.length === 1 && p.rosterIds[0] === confirmingDelete.id
      )
    : [];

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewName('');
    // Let the keyboard go. The group that was just made is in the list above
    // this field, and on a phone the keyboard is standing in front of it. The
    // opposite of Add Player on the Players tab, where the list is nowhere near
    // the field and the next name is the likeliest thing to happen next.
    newNameRef.current?.blur();
  }

  function stopEditing() {
    setEditingId(null);
    setEditingName('');
  }

  function commitRename() {
    if (!editingName.trim()) return;
    onRename(editingId!, editingName);
    stopEditing();
  }

  function countFor(rosterId: string) {
    return players.filter((p) => p.rosterIds.includes(rosterId)).length;
  }

  /**
   * What the duplicate is offered as. Never a name already in the list, so
   * duplicating twice gives "(copy)" and then "(copy 2)" rather than two
   * groups nobody can tell apart.
   */
  function copyName(name: string) {
    if (!rosters.some((r) => r.name === `${name} (copy)`)) return `${name} (copy)`;
    let n = 2;
    while (rosters.some((r) => r.name === `${name} (copy ${n})`)) n++;
    return `${name} (copy ${n})`;
  }

  // The card every screen here is drawn on.
  const shell = (children: React.ReactNode, width: string) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className={`bg-white rounded-lg border-[3px] border-[#444] shadow-lg p-6 mx-4 w-full ${width} max-h-[92vh] overflow-y-auto overscroll-contain`}
      >
        {children}
      </div>
    </div>
  );

  if (confirmingDelete) {
    const others = rosters.filter((r) => r.id !== confirmingDelete.id);
    const count = stranded.length;

    return shell(
      <>
        <PanelHeading icon={TrashIcon} title={`Delete “${confirmingDelete.name}”?`} />

        {count > 0 ? (
          <p className="mt-2 mb-4 text-sm text-gray-600">
            {count} player{count === 1 ? ' is' : 's are'} only in this group. Move them or
            delete them?
          </p>
        ) : (
          <p className="mt-2 mb-4 text-sm text-gray-600">
            Every player in it also belongs to another group, so no one will be lost.
          </p>
        )}

        {/* Only when there is somebody to move. With nobody stranded this is a
            dropdown that would do nothing to anyone. */}
        {count > 0 && (
          <div className="mb-4">
            <p className="font-bold text-gray-800 mb-1">Move To:</p>
            <div className="flex gap-2">
              <select
                value={moveTo}
                aria-label="Group to move them to"
                onChange={(e) => setMoveTo(e.target.value)}
                className={`${FIELD} flex-1`}
              >
                {others.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  onDelete(confirmingDelete.id, moveTo);
                  setConfirmingDelete(null);
                  stopEditing();
                }}
                className={PRIMARY}
              >
                Move
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onDelete(confirmingDelete.id, null);
              setConfirmingDelete(null);
              stopEditing();
            }}
            className={`w-full ${DANGER}`}
          >
            {count > 0
              ? `Delete group and ${count} player${count === 1 ? '' : 's'}`
              : 'Delete group'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(null)}
            className={`w-full ${GREY}`}
          >
            Cancel
          </button>
        </div>
      </>,
      'max-w-sm'
    );
  }

  if (duplicating) {
    const members = countFor(duplicating.id);

    return shell(
      <>
        <div className="mb-4">
          <PanelHeading icon={CopyIcon} title="Duplicate Group" />
        </div>

        <label className="block font-bold text-gray-800 mb-1" htmlFor="duplicate-name">
          New Group Name
        </label>
        <input
          id="duplicate-name"
          type="text"
          value={duplicateName}
          autoFocus
          // Selected on arrival, so Save is one tap and typing over it is two.
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDuplicateName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDuplicating(null);
          }}
          className={FIELD}
        />

        {/* The thing nobody would guess: they are not copied, they are in both. */}
        {members > 0 && (
          <p className="mt-2 text-sm text-gray-600">
            The same {members} player{members === 1 ? '' : 's'} will be in both groups.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-5">
          <button
            type="button"
            disabled={!duplicateName.trim()}
            onClick={() => {
              onDuplicate(duplicating.id, duplicateName.trim());
              setDuplicating(null);
              stopEditing();
            }}
            className={PRIMARY}
          >
            Save
          </button>
          <button type="button" onClick={() => setDuplicating(null)} className={GREY}>
            Cancel
          </button>
        </div>
      </>,
      'max-w-sm'
    );
  }

  return shell(
    <>
      {/* Same treatment as the panel headings behind it: icon on the right,
          in the shared heading grey. */}
      <div className="mb-4">
        <PanelHeading icon={GroupSolidIcon} title="Manage Groups" />
      </div>

      <div className="space-y-2 mb-5">
        {rosters.map((r) =>
          editingId === r.id ? (
            <div key={r.id} className="space-y-2 rounded-md bg-gray-50 p-2">
              {/* Labelled, and not focused on arrival. The pencil is the way in
                  to Duplicate and Delete as much as to the name, and a keyboard
                  arriving unasked shoves the whole panel up the screen before
                  the host has seen what is on it. */}
              <label className="block font-bold text-gray-800" htmlFor="edit-group-name">
                Group Name
              </label>
              <input
                id="edit-group-name"
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename();
                  }
                  if (e.key === 'Escape') stopEditing();
                }}
                className={FIELD}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDuplicating(r);
                    setDuplicateName(copyName(r.name));
                  }}
                  className={`${GREY} ${WITH_ICON}`}
                >
                  <CopyIcon className="w-5 h-5" />
                  Duplicate
                </button>
                <button
                  type="button"
                  disabled={rosters.length <= 1}
                  title={rosters.length <= 1 ? 'You need at least one group' : undefined}
                  onClick={() => {
                    setConfirmingDelete(r);
                    setMoveTo(rosters.find((o) => o.id !== r.id)?.id ?? '');
                  }}
                  className={`${DANGER} ${WITH_ICON}`}
                >
                  <TrashIcon className="w-5 h-5" />
                  Delete
                </button>
                <button
                  type="button"
                  disabled={!editingName.trim()}
                  onClick={commitRename}
                  className={PRIMARY}
                >
                  Save
                </button>
                <button type="button" onClick={stopEditing} className={GREY}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={r.id} className="flex items-center gap-2">
              <span className="flex-1 text-gray-800">
                {r.name}
                <span className="text-gray-400 text-sm ml-2">({countFor(r.id)})</span>
              </span>
              {/* White on a border, as the pencil on the schedule is. The row is
                  a name and one way in, and a tinted button would read as the
                  thing to press rather than the way to change it. */}
              <button
                type="button"
                aria-label={`Edit ${r.name}`}
                title={`Edit ${r.name}`}
                onClick={() => {
                  setEditingId(r.id);
                  setEditingName(r.name);
                }}
                className="flex shrink-0 items-center rounded-md border border-gray-400 bg-white px-2.5 py-2 text-gray-700 shadow-sm transition-colors hover:bg-gray-100"
              >
                <PencilIcon className="w-5 h-5" />
              </button>
            </div>
          )
        )}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 mb-5">
        <input
          ref={newNameRef}
          data-tutorial="new-group-name"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New group name"
          className={FIELD}
        />
        <button type="submit" className={`${PRIMARY} shrink-0`}>
          Add
        </button>
      </form>

      <button type="button" onClick={onClose} className={`w-full ${GREY}`}>
        Done
      </button>
    </>,
    'max-w-md'
  );
}
