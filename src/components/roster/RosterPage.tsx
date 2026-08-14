import { useEffect, useState } from 'react';
import type { Player, Gender, Roster } from '../../types';
import { PlayerForm } from './PlayerForm';
import { PlayerList } from './PlayerList';
import { ManageRostersModal } from './ManageRostersModal';
import { AddToGroupDialog } from './AddToGroupDialog';
import { GroupPicker } from './GroupPicker';
import { Toggle } from '../Toggle';
import { PanelHeading } from '../PanelGlyph';
import { useScrollLock } from '../../hooks/useScrollLock';
import { panelCard } from '../panelStyles';
import {
  AddPlayerSolidIcon,
  ChevronDownIcon,
  CrowdSolidIcon,
  GroupSolidIcon,
  PencilIcon,
  TrashIcon,
} from '../icons';

// The panel headings all carry their icon in #60697c. It is written out at each
// use rather than held in a constant, because Tailwind only generates a class it
// can see written in the source.

interface Props {
  /** Every player in the app, across all rosters. */
  allPlayers: Player[];
  /** Players in the active roster only. */
  players: Player[];
  rosters: Roster[];
  activeRosterId: string;
  onSelectRoster: (id: string) => void;
  /** Returns the group it made, so the Add to Group dialog can tick it. */
  onAddRoster: (name: string) => Roster;
  onRenameRoster: (id: string, name: string) => void;
  onDeleteRoster: (id: string, moveTo: string | null) => void;
  /** A second group over the same players, who end up in both. */
  onDuplicateRoster: (id: string, name: string) => void;
  onAdd: (name: string, rating: number, gender: Gender, rosterIds: string[]) => void;
  onUpdate: (id: string, updates: Partial<Omit<Player, 'id'>>) => void;
  onAddPlayersToRosters: (playerIds: string[], rosterIds: string[]) => void;
  onDeletePlayer: (id: string) => void;
  onContinue: () => void;
  /**
   * Whether Manage Groups is open.
   *
   * Held by App rather than here, because the panel that closes the first-run
   * tour offers a Manage button of its own — it puts the host straight into the
   * same dialog this page's Manage opens, and there is no way to reach a state
   * that lives inside this page from up there.
   */
  manageOpen: boolean;
  onManageOpenChange: (open: boolean) => void;
  /** Rating a new player starts with — set from Settings. */
  defaultRating: number;
}

export function RosterPage({
  allPlayers,
  players,
  rosters,
  activeRosterId,
  onSelectRoster,
  onAddRoster,
  onRenameRoster,
  onDeleteRoster,
  onDuplicateRoster,
  onAdd,
  onUpdate,
  onAddPlayersToRosters,
  onDeletePlayer,
  onContinue,
  manageOpen,
  onManageOpenChange,
  defaultRating,
}: Props) {
  // Dialog state is stamped with the roster it was opened under, so a roster
  // switch implicitly closes it — saving against a stale context would write to
  // a player who is no longer listed and be silently discarded.
  const [editing, setEditing] = useState<{ player: Player; rosterId: string } | null>(null);
  const [orphan, setOrphan] = useState<{ player: Player; rosterId: string } | null>(null);
  const [draftRosterIds, setDraftRosterIds] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  // Selection is stamped with its group too, so switching groups clears it
  const [selection, setSelection] = useState<{ ids: string[]; rosterId: string } | null>(null);
  const [showAddToGroup, setShowAddToGroup] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Whether the list is the whole pool rather than this group.
   *
   * A view over the table, not a mode: nothing about it is saved, so leaving the
   * tab puts it back. It is the one way to reach somebody who is in a group you
   * are not looking at, which used to mean switching groups to find them.
   */
  const [showAll, setShowAll] = useState(false);

  const editingPlayer = editing?.rosterId === activeRosterId ? editing.player : null;
  const orphanCandidate = orphan?.rosterId === activeRosterId ? orphan.player : null;
  const selectedIds = selection?.rosterId === activeRosterId ? selection.ids : [];
  const activeRoster = rosters.find((r) => r.id === activeRosterId);
  const shown = showAll ? allPlayers : players;

  /**
   * The page holds still under every dialog this panel opens.
   *
   * One lock for all of them rather than one each: a lock reads the scroll
   * position when it takes hold, and a second taken while the first is on reads
   * zero, because a pinned body has no scroll left to report. Manage Groups
   * opens Duplicate and Delete inside itself, so nesting was never theoretical.
   *
   * What it fixes: tapping into New Group Name scrolled the page behind the
   * dialog to bring a field into view that was not on it, and closing the
   * dialog left the host somewhere they had never been.
   */
  useScrollLock(
    manageOpen || showPicker || showAddToGroup || !!editing || !!orphan || confirmDelete
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Stamping makes stale dialog state inert, but it would come back to life on
  // returning to the same group — so discard it outright when the user switches.
  function handleSelectRoster(id: string) {
    setSelection(null);
    setShowAddToGroup(false);
    setEditing(null);
    setOrphan(null);
    setShowPicker(false);
    // Back to the group's own list. Left on, changing group would leave every
    // row exactly where it was, which reads as the switch having done nothing.
    setShowAll(false);
    onSelectRoster(id);
  }

  function clearSelection() {
    setSelection(null);
    setShowAddToGroup(false);
  }

  // The ticks go with it. Somebody ticked in one list and hidden in the other
  // would still be counted, and Select All would tick a list it cannot see.
  function toggleShowAll(on: boolean) {
    setShowAll(on);
    clearSelection();
  }

  function toggleSelect(id: string) {
    setSelection((prev) => {
      const ids = prev?.rosterId === activeRosterId ? prev.ids : [];
      return {
        rosterId: activeRosterId,
        ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
      };
    });
  }

  function toggleSelectAll() {
    const allIds = shown.map((p) => p.id);
    setSelection({
      rosterId: activeRosterId,
      ids: selectedIds.length === allIds.length ? [] : allIds,
    });
  }

  function handleAddToGroups(targetIds: string[]) {
    const count = selectedIds.length;
    onAddPlayersToRosters(selectedIds, targetIds);
    const names = rosters.filter((r) => targetIds.includes(r.id)).map((r) => r.name);
    setNotice(
      `${count} player${count === 1 ? '' : 's'} added to ${names.join(', ')}.`
    );
    clearSelection();
  }

  function startEdit(player: Player) {
    setEditing({ player, rosterId: activeRosterId });
    setDraftRosterIds(player.rosterIds);
  }

  function closeEdit() {
    setEditing(null);
    setDraftRosterIds([]);
  }

  function handleSubmit(name: string, rating: number, gender: Gender) {
    if (editingPlayer) {
      if (draftRosterIds.length === 0) {
        // Saving with no rosters means the player has nowhere left to live
        setOrphan({ player: { ...editingPlayer, name, rating, gender }, rosterId: activeRosterId });
        return;
      }
      onUpdate(editingPlayer.id, { name, rating, gender, rosterIds: draftRosterIds });
      closeEdit();
    } else {
      onAdd(name, rating, gender, [activeRosterId]);
    }
  }

  function toggleDraftRoster(rosterId: string) {
    setDraftRosterIds((prev) =>
      prev.includes(rosterId) ? prev.filter((r) => r !== rosterId) : [...prev, rosterId]
    );
  }

  // The Delete button inside the edit dialog. Unlike the orphan prompt, which
  // is reached by accident, this one is asked for.
  function handleDeletePlayer() {
    if (!editingPlayer) return;
    const { id, name } = editingPlayer;
    onDeletePlayer(id);
    setConfirmDelete(false);
    closeEdit();
    // They may have been ticked when the pencil was pressed
    setSelection((prev) =>
      prev ? { ...prev, ids: prev.ids.filter((x) => x !== id) } : prev
    );
    setNotice(`${name} deleted from every group.`);
  }

  function confirmOrphanDelete() {
    if (!orphanCandidate) return;
    onDeletePlayer(orphanCandidate.id);
    setOrphan(null);
    closeEdit();
  }

  // Cancel reverts: the player keeps the roster they were about to leave
  function cancelOrphanDelete() {
    if (orphanCandidate && editingPlayer) {
      setDraftRosterIds(
        editingPlayer.rosterIds.length > 0 ? editingPlayer.rosterIds : [activeRosterId]
      );
    }
    setOrphan(null);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow border border-[#ddd] px-3 pt-[1.125rem] pb-6">
        {/* A heading now rather than a label. It labelled the select that used
            to sit below, and there is no form control left for it to point at.
            Sized to match "Add Player" further down the page. */}
        <h2 className="flex items-center gap-2 text-[1.35rem] font-extrabold text-[#222] mb-2">
          My Groups
          <GroupSolidIcon className="w-[30px] h-[30px] text-[#60697c]" />
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Which group you are in is the thing this panel exists to tell you,
              so it is set at the size of a name in the list below rather than
              the small type a select had it in. Cut with an ellipsis if it runs
              out of room; the picker shows it whole.

              An absolute size rather than text-xl, so large text mode leaves it
              alone: scaled up it was the biggest thing on the page and read as
              a heading rather than the setting it is. */}
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            aria-haspopup="dialog"
            data-tutorial="group-name"
            className="flex-1 min-w-[160px] min-h-12 flex items-center justify-between gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-left hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <span
              className="min-w-0 truncate text-[1.25rem] font-bold text-[#222]"
              title={activeRoster?.name}
            >
              {activeRoster?.name}
            </span>
            <ChevronDownIcon className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={() => onManageOpenChange(true)}
            className="flex items-center justify-center min-h-10 px-4 py-1.5 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark transition-colors text-sm font-medium"
          >
            Manage
          </button>
        </div>
      </div>

      {notice && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-md px-4 py-2.5 text-sm">
          {notice}
        </div>
      )}

      {/* Hidden on an empty group: a disabled button with nothing to explain it
          is noise on the one screen a newcomer needs to be simple. */}
      {players.length > 0 && (
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={onContinue}
            data-tutorial="continue-setup"
            disabled={players.length < 4}
            className="px-6 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue to Setup &rarr;
          </button>
          {players.length < 4 && (
            <p className="text-amber-600 text-sm">
              Need at least 4 players to continue
            </p>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow border border-[#ddd] px-3 pt-[1.125rem] pb-6">
        <h2 className="flex items-center gap-2 text-[1.35rem] font-extrabold text-[#222] mb-4">
          Add Player
          <AddPlayerSolidIcon className="w-[26px] h-[26px] text-[#60697c]" />
        </h2>
        <PlayerForm onSubmit={handleSubmit} defaultRating={defaultRating} />
      </div>

      {/* Both delete prompts replace the edit modal rather than stacking on it —
          two fixed overlays would double-dim the page and trap clicks. */}
      {editingPlayer && !orphanCandidate && !confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className={`bg-white ${panelCard} p-6 mx-4 max-w-md w-full max-h-[92vh] overflow-y-auto overscroll-contain`}>
            <div className="mb-4">
              <PanelHeading icon={PencilIcon} title="Edit Player" />
            </div>
            <PlayerForm
              onSubmit={handleSubmit}
              defaultRating={defaultRating}
              editingPlayer={editingPlayer}
              onCancelEdit={closeEdit}
              onDelete={() => setConfirmDelete(true)}
              rosters={rosters}
              selectedRosterIds={draftRosterIds}
              onRosterToggle={toggleDraftRoster}
            />
          </div>
        </div>
      )}

      {editingPlayer && confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className={`bg-white ${panelCard} p-6 mx-4 max-w-sm w-full`}>
            <PanelHeading
              icon={TrashIcon}
              title={`Delete ${editingPlayer.name} from every group?`}
            />
            <p className="mt-2 mb-4 text-sm text-gray-600 text-center">
              This removes them from the app completely. It cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePlayer}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {orphanCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className={`bg-white ${panelCard} p-6 mx-4 max-w-sm w-full`}>
            <PanelHeading
              icon={TrashIcon}
              title={`Delete ${orphanCandidate.name} permanently?`}
            />
            <p className="mt-2 mb-4 text-sm text-gray-600 text-center">
              They aren&rsquo;t in any group anymore. This removes them from the app completely.
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelOrphanDelete}
                className="flex-1 px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmOrphanDelete}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddToGroup && selectedIds.length > 0 && (
        <AddToGroupDialog
          playerCount={selectedIds.length}
          // Over the whole pool the group in front is a target like any other:
          // the ticked people may not be in it, and putting them there is the
          // obvious thing to want. On its own list they are already in it.
          groups={showAll ? rosters : rosters.filter((r) => r.id !== activeRosterId)}
          onCreateGroup={onAddRoster}
          onConfirm={handleAddToGroups}
          onCancel={() => setShowAddToGroup(false)}
        />
      )}

      {showPicker && (
        <GroupPicker
          groups={rosters}
          players={allPlayers}
          activeId={activeRosterId}
          onSelect={handleSelectRoster}
          onClose={() => setShowPicker(false)}
        />
      )}

      {manageOpen && (
        <ManageRostersModal
          rosters={rosters}
          players={allPlayers}
          onAdd={onAddRoster}
          onRename={onRenameRoster}
          onDelete={onDeleteRoster}
          onDuplicate={onDuplicateRoster}
          onClose={() => onManageOpenChange(false)}
        />
      )}

      {/* A brand new app replaces the whole panel, heading and switch included,
          since none of them can be acted on with nobody anywhere to act on. An
          empty *group* keeps them: Show All Players is how you find out that the
          people you are missing are sitting in the group next door. */}
      {allPlayers.length === 0 ? (
        <div className="roster-panel bg-white rounded-lg shadow border border-[#ddd] px-3 py-12 text-center">
          <p className="text-xl font-medium text-gray-400">Add your first player!</p>
          <p className="mt-2 text-sm text-gray-400">
            You&rsquo;ll need at least 4 to build a schedule.
          </p>
        </div>
      ) : (
        <div className="roster-panel bg-white rounded-lg shadow border border-[#ddd] px-3 pt-[1.125rem] pb-6">
          {/* Two columns, not two rows. The heading and the button under it are
              one column so the button follows the words it belongs to; the
              switch is the other. Stacked as rows, the switch is the taller of
              the two and its height became a hole under the heading. */}
          <div className="flex justify-between items-start gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[1.35rem] font-extrabold text-[#222]">
                {showAll ? 'All Players' : 'Group Members'} ({shown.length})
                {/* Three people for a group, a crowd for everybody. The glyph
                    is the fastest way to see which list is up, and the group
                    one over the whole pool would say the opposite of the words
                    beside it. */}
                {showAll ? (
                  <CrowdSolidIcon className="w-[30px] h-[30px] text-[#60697c]" />
                ) : (
                  <GroupSolidIcon className="w-[30px] h-[30px] text-[#60697c]" />
                )}
              </h2>

              {/* Nothing to tick means nothing to act on, so the row goes with
                  the list rather than leaving a dead button over an empty
                  panel. */}
              {shown.length > 0 && (
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  {/* Set at the size of the names being counted, in both text
                      modes. A row in the table carries no size class of its
                      own, so it inherits the base, which is what text-base
                      matches. Absent rather than counting to zero, so the row
                      is the button alone until there is something to say. */}
                  {selectedIds.length > 0 && (
                    <span className="text-base font-bold text-gray-600">
                      {selectedIds.length} selected
                    </span>
                  )}
                  <button
                    onClick={() => setShowAddToGroup(true)}
                    disabled={selectedIds.length === 0}
                    className="px-4 py-1.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {/* "Another" only means anything against a list that is this
                        group. Over the whole pool there is no this group to be
                        another of, and the group in front is a target like any. */}
                    {showAll ? 'Add to Group' : 'Add to Another Group'}
                  </button>
                </div>
              )}
            </div>

            {/* Labelled above rather than beside, and held narrow enough that
                the three words stack instead of taking the width a phone needs
                for the heading. Unheld, the heading is what wraps. */}
            <div className="flex shrink-0 flex-col items-center gap-1">
              <span className="max-w-[5.25rem] text-center text-sm font-bold leading-tight text-gray-700">
                Show All Players
              </span>
              <Toggle checked={showAll} onChange={toggleShowAll} label="Show All Players" />
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="py-8 text-center text-gray-400">
              Nobody in this group yet. Add a player above, or turn on Show All Players to
              see everybody.
            </p>
          ) : (
            <PlayerList
              players={shown}
              onEdit={startEdit}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
            />
          )}
        </div>
      )}
    </div>
  );
}
