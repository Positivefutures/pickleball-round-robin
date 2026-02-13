import { useState, useCallback, useEffect } from 'react';
import type { Schedule } from './types';
import { usePlayers } from './hooks/usePlayers';
import { useLocalStorage } from './hooks/useLocalStorage';
import { generateSchedule } from './lib/pairing';
import { Header } from './components/layout/Header';
import { StepIndicator } from './components/layout/StepIndicator';
import type { Step } from './components/layout/StepIndicator';
import { RosterPage } from './components/roster/RosterPage';
import { SetupPage } from './components/setup/SetupPage';
import { SchedulePage } from './components/schedule/SchedulePage';
import { PrintSchedule } from './components/print/PrintSchedule';

function App() {
  const { players, addPlayer, updatePlayer, removePlayer } = usePlayers();
  const [step, setStep] = useState<Step>('roster');

  // Session config state
  const [selectedIds, setSelectedIds] = useLocalStorage<string[]>('pb-selected-ids', []);
  const [numCourts, setNumCourts] = useState(3);
  const [numRounds, setNumRounds] = useState(6);
  const [genderedEnabled, setGenderedEnabled] = useState(false);
  const [genderedFrequency, setGenderedFrequency] = useState(2);
  const [schedule, setSchedule] = useState<Schedule | null>(null);

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

  const handleGenerate = useCallback(() => {
    const attending = players.filter((p) => selectedIds.includes(p.id));
    if (attending.length < 4) return;
    const result = generateSchedule(
      attending,
      numCourts,
      numRounds,
      genderedEnabled,
      genderedFrequency
    );
    setSchedule(result);
    setStep('schedule');
  }, [players, selectedIds, numCourts, numRounds, genderedEnabled, genderedFrequency]);

  const attendingPlayers = players.filter((p) => selectedIds.includes(p.id));

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
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
            onRegenerate={handleGenerate}
            onBack={() => setStep('setup')}
          />
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 pt-6 no-print" style={{ paddingBottom: 40 }}>
        Created by Jeff Baker &ndash; positivefutures.ai
      </footer>

      <PrintSchedule schedule={schedule} />
    </div>
  );
}

export default App;
