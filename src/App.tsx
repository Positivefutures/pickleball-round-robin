import { useState, useCallback, useEffect } from 'react';
import type { Schedule, LockedPair } from './types';
import { usePlayers } from './hooks/usePlayers';
import { useRosters } from './hooks/useRosters';
import { useLocalStorage } from './hooks/useLocalStorage';
import { KEYS } from './lib/migrations';
import { generateSchedule, reshuffleSchedule, regenerateRemaining } from './lib/pairing';
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

  const togglePlayer = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, [setSelectedIds]);

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
    if (!keepSelection) setSelectedIds([]);
    setScheduleRosterId(null);
  }, [setSchedule, setCompletedRounds, setRemovedIds, setSelectedIds, setScheduleRosterId]);

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
    },
    [activeRosterId, schedule, setActiveRosterId, setSelectedIds]
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

  const handleGenerate = useCallback((locks?: Record<number, LockedPair[]>) => {
    const attending = rosterPlayers.filter((p) => selectedIds.includes(p.id));
    if (attending.length < 4) return;
    const hasLocks = locks && Object.keys(locks).length > 0;
    const result = hasLocks
      ? reshuffleSchedule(attending, numCourts, numRounds, locks, genderedEnabled, genderedFrequency)
      : generateSchedule(attending, numCourts, numRounds, genderedEnabled, genderedFrequency);
    setSchedule(result);
    // A fresh schedule starts over: nothing played, nobody gone
    setCompletedRounds([]);
    setRemovedIds([]);
    setScheduleRosterId(activeRosterId);
    setStep('schedule');
  }, [rosterPlayers, selectedIds, numCourts, numRounds, genderedEnabled, genderedFrequency,
      activeRosterId, setSchedule, setCompletedRounds, setRemovedIds, setScheduleRosterId]);

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

    setSchedule(
      regenerateRemaining(
        remaining, numCourts, schedule.rounds, completedRounds,
        genderedEnabled, genderedFrequency
      )
    );
    setRemovedIds((prev) => [...prev, playerId]);
  }, [schedule, attendingPlayers, completedRounds, numCourts, genderedEnabled,
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
            numCourts={numCourts}
            numRounds={numRounds}
            genderedEnabled={genderedEnabled}
            genderedFrequency={genderedFrequency}
            onTogglePlayer={togglePlayer}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onCourtsChange={setNumCourts}
            onRoundsChange={setNumRounds}
            onGenderedToggle={setGenderedEnabled}
            onGenderedFrequencyChange={setGenderedFrequency}
            onGenerate={handleGenerate}
            onBack={() => setStep('roster')}
          />
        )}

        {step === 'schedule' && schedule && (
          <SchedulePage
            schedule={schedule}
            players={attendingPlayers}
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
        Created by Jeff Baker &ndash; positivefutures.ai &middot; v1.9.0
      </footer>

      <PrintSchedule schedule={schedule} players={attendingPlayers} />
    </div>
  );
}

export default App;
