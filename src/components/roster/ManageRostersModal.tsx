import { useRef, useState } from 'react';
import type { Player, Roster } from '../../types';
import { CopyIcon, GroupSolidIcon, PencilIcon, TrashIcon } from '../icons';
import { LivePill } from '../LivePill';
import { PanelHeading } from '../PanelGlyph';
import { useLiveGroups } from '../../hooks/useLiveGroups';
import { panelCard } from '../panelStyles';

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
  /**
   * Switch to a group. The panel closes on the way, so this is the one action
   * here that is not about editing the list.
   */
  onSelect: (id: string) => void;
  /**
   * Opens Share Live Session on a group that is being shared, having switched
   * to it first. The same move the pill makes in GroupPicker.
   */
  onShareLive: (id: string) => void;
  onClose: () => void;
}

// The three buttons this panel has, written once. Six of them appear across the
// three screens below, and a red Delete that is a different red from the last
// red Delete is the kind of thing nobody notices until it is pointed out.
const PRIMARY =
  'px-4 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed';
const GREY_SHAPE =
  'px-4 py-2.5 border border-[#999] text-gray-700 rounded-md transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed';
const GREY = `${GREY_SHAPE} bg-gray-100 hover:bg-gray-200`;
const DANGER =
  'px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed';

const FIELD =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';
/**
 * The grey button, on the block that opens inside the list.
 *
 * That block is tinted, and everything drawn on it was picking the tint up: the
 * grey buttons were a shade of grey on a shade of grey, and Tailwind's reset
 * makes a form control's background transparent, so the name field showed the
 * tint through as well. White lifts all three off their own background. Only
 * here — the two panels that open over this one stand on white already, and a
 * white button on white is a button with no fill at all.
 */
const GREY_ON_TINT = `${GREY_SHAPE} bg-white hover:bg-gray-100`;

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
  onSelect,
  onShareLive,
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
  /** Which of these groups have links out. More than one can. */
  const live = useLiveGroups();

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

  /**
   * The card every screen here is drawn on.
   *
   * `high` pins it to the top of the screen instead of the middle. A panel that
   * opens with a field focused opens with the keyboard up, and a centred card
   * has its buttons behind it: the phone shrinks the visible area but not the
   * viewport this is positioned against, so nothing moves out of the way. Near
   * the top there is room for the whole card above the keyboard.
   */
  const shell = (children: React.ReactNode, width: string, high = false) => (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/40 ${
        high ? 'items-start pt-6' : 'items-center'
      }`}
    >
      <div
        className={`bg-white ${panelCard} p-6 mx-4 w-full ${width} max-h-[92vh] overflow-y-auto overscroll-contain`}
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
              ? `Delete Group and ${count} Player${count === 1 ? '' : 's'}`
              : 'Delete Group'}
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
      'max-w-sm',
      // The name field is focused on arrival, so this one always opens with the
      // keyboard standing where Save and Cancel would be.
      true
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
            <div key={r.id} className="space-y-2 rounded-md border border-gray-300 bg-gray-50 p-2">
              {/* Ruled, not just tinted. Opened for editing this block holds a
                  field and four buttons, and on the tint alone it ran into the
                  panel behind it. The line is the app's ordinary 1px grey, the
                  same one the field inside it is drawn with. */}
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
                className={`${FIELD} bg-white`}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDuplicating(r);
                    setDuplicateName(copyName(r.name));
                  }}
                  className={`${GREY_ON_TINT} ${WITH_ICON}`}
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
                <button type="button" onClick={stopEditing} className={GREY_ON_TINT}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={r.id}>
              <div className="flex items-center gap-2">
                {/* The name is the way onto the group, as it is in GroupPicker,
                    and unlabelled for the same reason: the accessible name is
                    what is written on it. This panel used to be somewhere you
                    could rename a group but not go to one, so a host who opened
                    it meaning to switch had to close it and find the picker.

                    The name is bold, the count beside it is not. The count is
                    how many players are in the group, not part of what it is
                    called, and bolding both makes the row read as one long
                    label. The negative margin is so the hover block can have
                    padding without the name sitting in from every other line in
                    the panel. */}
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  title={`Switch to ${r.name}`}
                  className="-ml-2 min-w-0 flex-1 rounded-md px-2 py-2 text-left font-bold
                    text-gray-800 transition-colors hover:bg-gray-100"
                >
                  {r.name}
                  <span className="text-gray-400 text-sm font-normal ml-2">
                    ({countFor(r.id)})
                  </span>
                </button>
                {/* White on a border, as the pencil on the schedule is. The row
                    is a name and one way in, and a tinted button would read as
                    the thing to press rather than the way to change it. */}
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
              {/* Under the name and not beside it. Beside it there is the
                  pencil, and a row that ends in two things to press is a row
                  where neither is obviously the way in. */}
              {live.has(r.id) && (
                <div className="-mt-1 pb-1">
                  <LivePill
                    label={`${r.name} is live: open Share Live Session`}
                    onClick={() => onShareLive(r.id)}
                  />
                </div>
              )}
            </div>
          )
        )}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 mb-5">
        <input
          ref={newNameRef}
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
