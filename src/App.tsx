import { useState, useCallback, useEffect } from 'react';
import type { Schedule, LockedPair } from './types';
import { usePlayers } from './hooks/usePlayers';
import { useLocalStorage } from './hooks/useLocalStorage';
import { generateSchedule, reshuffleSchedule, regenerateRemaining } from './lib/pairing';
import { Header } from './components/layout/Header';
import { StepIndicator } from './components/layout/StepIndicator';
import type { Step } from './components/layout/StepIndicator';
import { RosterPage } from './components/roster/RosterPage';
import { SetupPage } from './components/setup/SetupPage';
import { SchedulePage } from './components/schedule/SchedulePage';
import { PrintSchedule } from './components/print/PrintSchedule';

function App() {
  const { players, addPlayer, updatePlayer, removePlayer } = usePlayers();

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
  const [completedThrough, setCompletedThrough] = useLocalStorage('pb-completed-through', 0);
  const [removedIds, setRemovedIds] = useLocalStorage<string[]>('pb-removed-ids', []);

  const [step, setStep] = useState<Step>(schedule ? 'schedule' : 'roster');

  // Clean up stale IDs when roster changes
  useEffect(() => {
    const playerIds = new Set(players.map((p) => p.id));
    setSelectedIds((prev) => {
      const filtered = prev.filter((id) => playerIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [players, setSelectedIds]);

  const togglePlayer = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(players.map((p) => p.id));
  }, [players]);

  const deselectAll = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const handleGenerate = useCallback((locks?: Record<number, LockedPair[]>) => {
    const attending = players.filter((p) => selectedIds.includes(p.id));
    if (attending.length < 4) return;
    const hasLocks = locks && Object.keys(locks).length > 0;
    const result = hasLocks
      ? reshuffleSchedule(attending, numCourts, numRounds, locks, genderedEnabled, genderedFrequency)
      : generateSchedule(attending, numCourts, numRounds, genderedEnabled, genderedFrequency);
    setSchedule(result);
    // A fresh schedule starts over: nothing played, nobody gone
    setCompletedThrough(0);
    setRemovedIds([]);
    setStep('schedule');
  }, [players, selectedIds, numCourts, numRounds, genderedEnabled, genderedFrequency,
      setSchedule, setCompletedThrough, setRemovedIds]);

  const attendingPlayers = players.filter(
    (p) => selectedIds.includes(p.id) && !removedIds.includes(p.id)
  );

  // Removes a player from every round that hasn't been played yet and rebuilds
  // those rounds around the smaller group.
  const handleRemovePlayer = useCallback((playerId: string) => {
    if (!schedule) return;
    const remaining = attendingPlayers.filter((p) => p.id !== playerId);
    if (remaining.length < 4) return;

    const completed = schedule.rounds.slice(0, completedThrough);
    setSchedule(
      regenerateRemaining(
        remaining, numCourts, schedule.rounds.length, completed,
        genderedEnabled, genderedFrequency
      )
    );
    setRemovedIds((prev) => [...prev, playerId]);
  }, [schedule, attendingPlayers, completedThrough, numCourts, genderedEnabled,
      genderedFrequency, setSchedule, setRemovedIds]);

  const handleStartNewSession = useCallback(() => {
    setSchedule(null);
    setCompletedThrough(0);
    setRemovedIds([]);
    setStep('roster');
  }, [setSchedule, setCompletedThrough, setRemovedIds]);

  return (
    <div className={`min-h-screen bg-gray-50 ${largeText ? 'text-large' : ''}`}>
      <Header largeText={largeText} onToggleLargeText={() => setLargeText((v) => !v)} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <StepIndicator current={step} />

        {step === 'roster' && (
          <RosterPage
            players={players}
            onAdd={addPlayer}
            onUpdate={updatePlayer}
            onRemove={removePlayer}
            onContinue={() => setStep('setup')}
          />
        )}

        {step === 'setup' && (
          <SetupPage
            players={players}
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
            completedThrough={completedThrough}
            canUncomplete={removedIds.length === 0}
            onRegenerate={handleGenerate}
            onBack={() => setStep('setup')}
            onUpdateSchedule={setSchedule}
            onCompletedThroughChange={setCompletedThrough}
            onRemovePlayer={handleRemovePlayer}
            onStartNewSession={handleStartNewSession}
          />
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 pt-6 no-print" style={{ paddingBottom: 40 }}>
        Created by Jeff Baker &ndash; positivefutures.ai &middot; v1.6.0
      </footer>

      <PrintSchedule schedule={schedule} players={attendingPlayers} />
    </div>
  );
}

export default App;
