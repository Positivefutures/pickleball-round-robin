import { useEffect, useState } from 'react';
import type { Player, Gender, Roster } from '../../types';
import { PlayerForm } from './PlayerForm';
import { PlayerList } from './PlayerList';
import { ManageRostersModal } from './ManageRostersModal';
import { AddToGroupDialog } from './AddToGroupDialog';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { corePlayers } from '../../data/corePlayers';
import { KEYS } from '../../lib/migrations';

interface Props {
  /** Every player in the app, across all rosters. */
  allPlayers: Player[];
  /** Players in the active roster only. */
  players: Player[];
  rosters: Roster[];
  activeRosterId: string;
  onSelectRoster: (id: string) => void;
  onAddRoster: (name: string) => void;
  onRenameRoster: (id: string, name: string) => void;
  onDeleteRoster: (id: string, moveTo: string | null) => void;
  onAdd: (name: string, rating: number, gender: Gender, rosterIds: string[]) => void;
  onUpdate: (id: string, updates: Partial<Omit<Player, 'id'>>) => void;
  onSetPlayerRosters: (id: string, rosterIds: string[]) => void;
  onAddPlayersToRosters: (playerIds: string[], rosterIds: string[]) => void;
  onRemoveFromRoster: (playerId: string, rosterId: string) => void;
  onDeletePlayer: (id: string) => void;
  onContinue: () => void;
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
  onAdd,
  onUpdate,
  onSetPlayerRosters,
  onAddPlayersToRosters,
  onRemoveFromRoster,
  onDeletePlayer,
  onContinue,
}: Props) {
  // Dialog state is stamped with the roster it was opened under, so a roster
  // switch implicitly closes it — saving against a stale context would write to
  // a player who is no longer listed and be silently discarded.
  const [editing, setEditing] = useState<{ player: Player; rosterId: string } | null>(null);
  const [orphan, setOrphan] = useState<{ player: Player; rosterId: string } | null>(null);
  const [draftRosterIds, setDraftRosterIds] = useState<string[]>([]);
  const [showManage, setShowManage] = useState(false);
  const [coreImportedRosters, setCoreImportedRosters] = useLocalStorage<string[]>(
    KEYS.coreImportedRosters,
    []
  );

  // Selection is stamped with its group too, so switching groups clears it
  const [selection, setSelection] = useState<{ ids: string[]; rosterId: string } | null>(null);
  const [showAddToGroup, setShowAddToGroup] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const editingPlayer = editing?.rosterId === activeRosterId ? editing.player : null;
  const orphanCandidate = orphan?.rosterId === activeRosterId ? orphan.player : null;
  const selecting = selection?.rosterId === activeRosterId;
  const selectedIds = selecting ? selection!.ids : [];

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
    onSelectRoster(id);
  }

  function startSelecting() {
    setSelection({ ids: [], rosterId: activeRosterId });
  }

  function stopSelecting() {
    setSelection(null);
    setShowAddToGroup(false);
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
    const allIds = players.map((p) => p.id);
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
    stopSelecting();
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

  // Row Remove: drop from this roster, unless it's the player's last one
  function handleRemoveFromRoster(playerId: string) {
    const player = allPlayers.find((p) => p.id === playerId);
    if (!player) return;
    if (player.rosterIds.length <= 1) {
      setOrphan({ player, rosterId: activeRosterId });
      return;
    }
    onRemoveFromRoster(playerId, activeRosterId);
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

  function handleImportCorePlayers() {
    const byName = new Map(allPlayers.map((p) => [p.name.toLowerCase(), p]));
    for (const p of corePlayers) {
      const existing = byName.get(p.name.toLowerCase());
      if (existing) {
        // Same person, already in the app — just add them to this roster
        if (!existing.rosterIds.includes(activeRosterId)) {
          onSetPlayerRosters(existing.id, [...existing.rosterIds, activeRosterId]);
        }
      } else {
        onAdd(p.name, p.rating, p.gender, [activeRosterId]);
      }
    }
    setCoreImportedRosters((prev) =>
      prev.includes(activeRosterId) ? prev : [...prev, activeRosterId]
    );
  }

  const activeRoster = rosters.find((r) => r.id === activeRosterId);
  const alreadyImported = coreImportedRosters.includes(activeRosterId);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-bold text-gray-700" htmlFor="roster-select">
            My Groups
          </label>
          <select
            id="roster-select"
            value={activeRosterId}
            onChange={(e) => handleSelectRoster(e.target.value)}
            className="flex-1 min-w-[160px] px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
          >
            {rosters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowManage(true)}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
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

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Add Player</h2>
        <PlayerForm onSubmit={handleSubmit} />
      </div>

      {/* The delete prompt replaces the edit modal rather than stacking on it —
          two fixed overlays would double-dim the page and trap clicks. */}
      {editingPlayer && !orphanCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-md w-full">
            <h2 className="text-lg font-semibold mb-4">Edit Player</h2>
            <PlayerForm
              onSubmit={handleSubmit}
              editingPlayer={editingPlayer}
              onCancelEdit={closeEdit}
              rosters={rosters}
              selectedRosterIds={draftRosterIds}
              onRosterToggle={toggleDraftRoster}
            />
          </div>
        </div>
      )}

      {orphanCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-sm w-full">
            <p className="text-gray-800 text-center font-medium mb-2">
              Delete {orphanCandidate.name} permanently?
            </p>
            <p className="text-sm text-gray-600 text-center mb-4">
              They aren&rsquo;t in any group anymore. This removes them from the app completely.
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelOrphanDelete}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
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

      {showAddToGroup && selecting && (
        <AddToGroupDialog
          playerCount={selectedIds.length}
          groups={rosters.filter((r) => r.id !== activeRosterId)}
          onConfirm={handleAddToGroups}
          onCancel={() => setShowAddToGroup(false)}
        />
      )}

      {showManage && (
        <ManageRostersModal
          rosters={rosters}
          players={allPlayers}
          onAdd={onAddRoster}
          onRename={onRenameRoster}
          onDelete={onDeleteRoster}
          onClose={() => setShowManage(false)}
        />
      )}

      <div className="flex flex-col items-end gap-1">
        <button
          onClick={onContinue}
          disabled={players.length < 4}
          className="px-6 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue to Setup &rarr;
        </button>
        {players.length < 4 && players.length > 0 && (
          <p className="text-amber-600 text-sm">
            Need at least 4 players to continue
          </p>
        )}
      </div>

      <div className="roster-panel bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center gap-3 flex-wrap mb-4">
          <h2 className="text-lg font-semibold">
            {activeRoster?.name ?? 'Player Roster'} ({players.length})
          </h2>
          {selecting ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-600">{selectedIds.length} selected</span>
              <button
                onClick={() => setShowAddToGroup(true)}
                disabled={selectedIds.length === 0}
                className="px-4 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add to Group
              </button>
              <button
                onClick={stopSelecting}
                className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={startSelecting}
              disabled={rosters.length < 2 || players.length === 0}
              title={rosters.length < 2 ? 'Create another group first' : undefined}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select Players
            </button>
          )}
        </div>
        <PlayerList
          players={players}
          allPlayers={allPlayers}
          rosterName={activeRoster?.name}
          onEdit={startEdit}
          onRemove={handleRemoveFromRoster}
          selecting={selecting}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      </div>

      {!alreadyImported && (
        <div className="text-center pt-2">
          <button
            onClick={handleImportCorePlayers}
            className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Import Core Players
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Will import the most common players, such as Susan, Jeff, Adonica, etc.
          </p>
        </div>
      )}

    </div>
  );
}
