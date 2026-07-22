import { useState, useCallback, useEffect } from 'react';
import type { Schedule, LockedPair, Partnership } from './types';
import { usePlayers } from './hooks/usePlayers';
import { useRosters } from './hooks/useRosters';
import { useLocalStorage } from './hooks/useLocalStorage';
import { KEYS } from './lib/migrations';
import { generateSchedule, reshuffleSchedule, regenerateRemaining } from './lib/pairing';
import { prunePartnerships, arePartners } from './lib/partnerships';
import { Header } from './components/layout/Header';
import { StepIndicator } from './components/layout/StepIndicator';
import type { Step } from './components/layout/StepIndicator';
import { RosterPage } from './components/roster/RosterPage';
import { SetupPage } from './components/setup/SetupPage';
import { SchedulePage } from './components/schedule/SchedulePage';
import { PrintSchedule } from './components/print/PrintSchedule';

function App() {
  const {
    players: allPlayers,
    addPlayer,
    updatePlayer,
    setPlayerRosters,
    addPlayersToRosters,
    removeFromRoster,
    deletePlayer,
    reassignRoster,
  } = usePlayers();
  const {
    rosters,
    activeRosterId,
    activeRoster,
    setActiveRosterId,
    addRoster,
    renameRoster,
    deleteRoster,
  } = useRosters();

  // Session config state
  const [selectedIds, setSelectedIds] = useLocalStorage<string[]>('pb-selected-ids', []);
  // Fixed partnerships: couples kept on the same team every round. Persisted so
  // they survive a refresh and carry into the next session with the same crowd.
  const [partnerships, setPartnerships] = useLocalStorage<Partnership[]>(KEYS.partnerships, []);
  const [largeText, setLargeText] = useLocalStorage<boolean>('pb-large-text', false);
  const [numCourts, setNumCourts] = useLocalStorage('pb-num-courts', 3);
  const [numRounds, setNumRounds] = useLocalStorage('pb-num-rounds', 6);
  const [genderedEnabled, setGenderedEnabled] = useLocalStorage('pb-gendered-enabled', false);
  const [genderedFrequency, setGenderedFrequency] = useLocalStorage('pb-gendered-frequency', 2);

  // Live session state — persisted so a refresh mid-session doesn't lose the
  // schedule or which rounds have already been played.
  const [schedule, setSchedule] = useLocalStorage<Schedule | null>('pb-schedule', null);
  // Round numbers marked complete. An arbitrary set — the host may complete
  // rounds out of order.
  const [completedRounds, setCompletedRounds] = useLocalStorage<number[]>(KEYS.completedRounds, []);
  const [removedIds, setRemovedIds] = useLocalStorage<string[]>('pb-removed-ids', []);
  const [scheduleRosterId, setScheduleRosterId] = useLocalStorage<string | null>(
    KEYS.scheduleRoster,
    null
  );

  const [step, setStep] = useState<Step>(schedule ? 'schedule' : 'roster');
  const [pendingRosterSwitch, setPendingRosterSwitch] = useState<string | null>(null);

  // A saved session belongs to the roster it was built from. On boot, follow it
  // rather than stranding the user in a schedule full of another roster's players.
  useEffect(() => {
    if (schedule && scheduleRosterId && scheduleRosterId !== activeRosterId) {
      setActiveRosterId(scheduleRosterId);
    }
    // Boot-time only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Players in the roster currently being worked on
  const rosterPlayers = allPlayers.filter((p) => p.rosterIds.includes(activeRosterId));

  // Clean up stale IDs when the roster's membership changes
  useEffect(() => {
    const playerIds = new Set(rosterPlayers.map((p) => p.id));
    setSelectedIds((prev) => {
      const filtered = prev.filter((id) => playerIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
    // rosterPlayers is derived; keying on the ids keeps this from looping
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlayers, activeRosterId, setSelectedIds]);

  // A partnership only makes sense while both members are selected. Whenever the
  // selection shrinks (deselect, roster cleanup), drop any now-invalid couple.
  useEffect(() => {
    const sel = new Set(selectedIds);
    setPartnerships((prev) => {
      const next = prunePartnerships(prev, sel);
      return next.length === prev.length ? prev : next;
    });
  }, [selectedIds, setPartnerships]);

  const togglePlayer = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, [setSelectedIds]);

  const createPartnership = useCallback((id1: string, id2: string) => {
    if (id1 === id2) return;
    setPartnerships((prev) => {
      // Neither player may already be in a partnership.
      const taken = new Set(prev.flatMap((p) => [p.player1Id, p.player2Id]));
      if (taken.has(id1) || taken.has(id2)) return prev;
      return [...prev, { player1Id: id1, player2Id: id2 }];
    });
  }, [setPartnerships]);

  const removePartnership = useCallback((id1: string, id2: string) => {
    setPartnerships((prev) => prev.filter((p) => !arePartners(id1, id2, [p])));
  }, [setPartnerships]);

  const selectAll = useCallback(() => {
    setSelectedIds(rosterPlayers.map((p) => p.id));
  }, [rosterPlayers, setSelectedIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds([]);
  }, [setSelectedIds]);

  // keepSelection is used by "Start New Session": the same crowd usually plays
  // each time, so the previously chosen players stay selected for the next one.
  // A roster switch clears the selection instead, since it's a different group.
  const clearSession = useCallback((keepSelection = false) => {
    setSchedule(null);
    setCompletedRounds([]);
    setRemovedIds([]);
    // "Start New Session" keeps the crowd (and their couples); a group switch
    // clears both since it's a different set of people.
    if (!keepSelection) {
      setSelectedIds([]);
      setPartnerships([]);
    }
    setScheduleRosterId(null);
  }, [setSchedule, setCompletedRounds, setRemovedIds, setSelectedIds, setPartnerships, setScheduleRosterId]);

  // Switching rosters invalidates an in-progress session, so confirm first
  const handleSelectRoster = useCallback(
    (id: string) => {
      if (id === activeRosterId) return;
      if (schedule) {
        setPendingRosterSwitch(id);
        return;
      }
      setActiveRosterId(id);
      setSelectedIds([]);
      setPartnerships([]);
    },
    [activeRosterId, schedule, setActiveRosterId, setSelectedIds, setPartnerships]
  );

  const confirmRosterSwitch = useCallback(() => {
    if (!pendingRosterSwitch) return;
    clearSession();
    setActiveRosterId(pendingRosterSwitch);
    setPendingRosterSwitch(null);
    setStep('roster');
  }, [pendingRosterSwitch, clearSession, setActiveRosterId]);

  const handleDeleteRoster = useCallback(
    (id: string, moveTo: string | null) => {
      reassignRoster(id, moveTo);
      if (scheduleRosterId === id) clearSession();
      deleteRoster(id);
    },
    [reassignRoster, deleteRoster, scheduleRosterId, clearSession]
  );

  const handleGenerate = useCallback((
    locks?: Record<number, LockedPair[]>,
    brokenPairs?: Record<number, string[]>
  ) => {
    const attending = rosterPlayers.filter((p) => selectedIds.includes(p.id));
    if (attending.length < 4) return;
    const activePartnerships = prunePartnerships(
      partnerships, new Set(attending.map((p) => p.id))
    );
    // A call carrying locks or per-round breaks comes from the Schedule tab's
    // Reshuffle; the initial Generate from Setup carries neither.
    const isReshuffle =
      (locks && Object.keys(locks).length > 0) ||
      (brokenPairs && Object.keys(brokenPairs).length > 0);
    const result = isReshuffle
      ? reshuffleSchedule(
          attending, numCourts, numRounds, locks ?? {}, genderedEnabled,
          genderedFrequency, activePartnerships, brokenPairs ?? {}
        )
      : generateSchedule(
          attending, numCourts, numRounds, genderedEnabled, genderedFrequency,
          activePartnerships
        );
    setSchedule(result);
    // A fresh schedule starts over: nothing played, nobody gone
    setCompletedRounds([]);
    setRemovedIds([]);
    setScheduleRosterId(activeRosterId);
    setStep('schedule');
  }, [rosterPlayers, selectedIds, partnerships, numCourts, numRounds, genderedEnabled,
      genderedFrequency, activeRosterId, setSchedule, setCompletedRounds, setRemovedIds,
      setScheduleRosterId]);

  const attendingPlayers = rosterPlayers.filter(
    (p) => selectedIds.includes(p.id) && !removedIds.includes(p.id)
  );

  // Removes a player from every round that isn't marked complete and rebuilds
  // those rounds around the smaller group. Completed rounds — any subset — are
  // kept verbatim.
  const handleRemovePlayer = useCallback((playerId: string) => {
    if (!schedule) return;
    const remaining = attendingPlayers.filter((p) => p.id !== playerId);
    if (remaining.length < 4) return;

    const activePartnerships = prunePartnerships(
      partnerships, new Set(remaining.map((p) => p.id))
    );
    setSchedule(
      regenerateRemaining(
        remaining, numCourts, schedule.rounds, completedRounds,
        genderedEnabled, genderedFrequency, activePartnerships
      )
    );
    setRemovedIds((prev) => [...prev, playerId]);
  }, [schedule, attendingPlayers, partnerships, completedRounds, numCourts, genderedEnabled,
      genderedFrequency, setSchedule, setRemovedIds]);

  const handleStartNewSession = useCallback(() => {
    clearSession(true); // keep the selected players for the next session
    setStep('roster');
  }, [clearSession]);

  return (
    <div className={`min-h-screen bg-gray-50 ${largeText ? 'text-large' : ''}`}>
      <Header largeText={largeText} onToggleLargeText={() => setLargeText((v) => !v)} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <StepIndicator current={step} />

        {step === 'roster' && (
          <RosterPage
            allPlayers={allPlayers}
            players={rosterPlayers}
            rosters={rosters}
            activeRosterId={activeRosterId}
            onSelectRoster={handleSelectRoster}
            onAddRoster={addRoster}
            onRenameRoster={renameRoster}
            onDeleteRoster={handleDeleteRoster}
            onAdd={addPlayer}
            onUpdate={updatePlayer}
            onSetPlayerRosters={setPlayerRosters}
            onAddPlayersToRosters={addPlayersToRosters}
            onRemoveFromRoster={removeFromRoster}
            onDeletePlayer={deletePlayer}
            onContinue={() => setStep('setup')}
          />
        )}

        {step === 'setup' && (
          <SetupPage
            players={rosterPlayers}
            selectedIds={selectedIds}
            partnerships={partnerships}
            numCourts={numCourts}
            numRounds={numRounds}
            genderedEnabled={genderedEnabled}
            genderedFrequency={genderedFrequency}
            onTogglePlayer={togglePlayer}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onCreatePartnership={createPartnership}
            onRemovePartnership={removePartnership}
            onCourtsChange={setNumCourts}
            onRoundsChange={setNumRounds}
            onGenderedToggle={setGenderedEnabled}
            onGenderedFrequencyChange={setGenderedFrequency}
            onGenerate={() => handleGenerate()}
            onBack={() => setStep('roster')}
          />
        )}

        {step === 'schedule' && schedule && (
          <SchedulePage
            schedule={schedule}
            players={attendingPlayers}
            partnerships={partnerships}
            numCourts={numCourts}
            completedRounds={completedRounds}
            canUncomplete={removedIds.length === 0}
            onRegenerate={handleGenerate}
            onBack={() => setStep('setup')}
            onUpdateSchedule={setSchedule}
            onCompletedRoundsChange={setCompletedRounds}
            onRemovePlayer={handleRemovePlayer}
            onStartNewSession={handleStartNewSession}
          />
        )}
      </main>

      {pendingRosterSwitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-sm w-full">
            <p className="text-gray-800 text-center font-medium mb-2">Switch groups?</p>
            <p className="text-sm text-gray-600 text-center mb-4">
              You have a round robin session in progress for{' '}
              <span className="font-medium">{activeRoster?.name}</span>. Switching groups will
              clear it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingRosterSwitch(null)}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmRosterSwitch}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
              >
                Switch
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center text-xs text-gray-400 pt-6 no-print" style={{ paddingBottom: 40 }}>
        Created by Jeff Baker &ndash; positivefutures.ai &middot; v1.10.0
      </footer>

      <PrintSchedule schedule={schedule} players={attendingPlayers} />
    </div>
  );
}

export default App;
