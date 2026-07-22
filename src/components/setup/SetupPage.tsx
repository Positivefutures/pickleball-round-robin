import { useState } from 'react';
import type { Player, Partnership } from '../../types';
import { PlayerSelector } from './PlayerSelector';
import { PartnerPairing } from './PartnerPairing';
import { SessionConfig } from './SessionConfig';

interface Props {
  players: Player[];
  selectedIds: string[];
  partnerships: Partnership[];
  numCourts: number;
  numRounds: number;
  genderedEnabled: boolean;
  genderedFrequency: number;
  onTogglePlayer: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCreatePartnership: (id1: string, id2: string) => void;
  onRemovePartnership: (id1: string, id2: string) => void;
  onCourtsChange: (n: number) => void;
  onRoundsChange: (n: number) => void;
  onGenderedToggle: (enabled: boolean) => void;
  onGenderedFrequencyChange: (n: number) => void;
  onGenerate: () => void;
  onBack: () => void;
}

export function SetupPage({
  players,
  selectedIds,
  partnerships,
  numCourts,
  numRounds,
  genderedEnabled,
  genderedFrequency,
  onTogglePlayer,
  onSelectAll,
  onDeselectAll,
  onCreatePartnership,
  onRemovePartnership,
  onCourtsChange,
  onRoundsChange,
  onGenderedToggle,
  onGenderedFrequencyChange,
  onGenerate,
  onBack,
}: Props) {
  const [showError, setShowError] = useState(false);
  const [mode, setMode] = useState<'select' | 'pair'>('select');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const playersNeeded = numCourts * 4;
  const notEnoughPlayers = selectedIds.length < playersNeeded;
  const canGenerate = selectedIds.length >= 4 && !notEnoughPlayers;

  const errorMessage = !canGenerate
    ? selectedIds.length < 4
      ? 'Select at least 4 players to generate a schedule'
      : `Need at least ${playersNeeded} players for ${numCourts} courts (have ${selectedIds.length})`
    : '';

  const selectedPlayers = players.filter((p) => selectedIds.includes(p.id));

  function handleGenerate() {
    if (canGenerate) {
      setShowError(false);
      onGenerate();
    } else {
      setShowError(true);
    }
  }

  function handleToggleMode() {
    setPendingId(null);
    setMode((m) => (m === 'select' ? 'pair' : 'select'));
  }

  // Two-tap pairing: first tap arms a player, second tap links them.
  function handleTapPlayer(id: string) {
    if (pendingId === null) {
      setPendingId(id);
      return;
    }
    if (pendingId === id) {
      setPendingId(null);
      return;
    }
    onCreatePartnership(pendingId, id);
    setPendingId(null);
  }

  // Needs at least two selected players before pairing is meaningful.
  const canPair = selectedIds.length >= 2;

  const buttonRow = (
    <div>
      <div className="flex justify-between">
        <button
          onClick={handleToggleMode}
          disabled={mode === 'select' && !canPair}
          className={`px-6 py-2.5 rounded-md transition-colors font-medium ${
            mode === 'pair'
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          {mode === 'select' ? 'Set Partners' : 'Done Pairing'}
        </button>
        <button
          onClick={handleGenerate}
          className="px-6 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
        >
          Generate Schedule
        </button>
      </div>
      {showError && errorMessage && (
        <p className="text-red-600 text-sm text-right mt-2">{errorMessage}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Back to Players moved above the session configuration */}
      <div>
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          &larr; Back to Players
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Session Configuration</h2>
        <SessionConfig
          numCourts={numCourts}
          numRounds={numRounds}
          onCourtsChange={onCourtsChange}
          onRoundsChange={onRoundsChange}
          numPlayers={selectedIds.length}
          genderedEnabled={genderedEnabled}
          genderedFrequency={genderedFrequency}
          onGenderedToggle={onGenderedToggle}
          onGenderedFrequencyChange={onGenderedFrequencyChange}
        />
      </div>

      {buttonRow}

      <div className="bg-white rounded-lg shadow p-6">
        {mode === 'select' ? (
          <PlayerSelector
            players={players}
            selectedIds={selectedIds}
            onToggle={onTogglePlayer}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
          />
        ) : (
          <PartnerPairing
            players={selectedPlayers}
            partnerships={partnerships}
            pendingId={pendingId}
            onTapPlayer={handleTapPlayer}
            onUnpair={onRemovePartnership}
          />
        )}
      </div>

      {buttonRow}
    </div>
  );
}
