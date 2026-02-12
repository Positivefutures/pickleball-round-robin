import type { Player } from '../../types';
import { PlayerSelector } from './PlayerSelector';
import { SessionConfig } from './SessionConfig';

interface Props {
  players: Player[];
  selectedIds: string[];
  numCourts: number;
  numRounds: number;
  genderedEnabled: boolean;
  genderedFrequency: number;
  onTogglePlayer: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
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
  numCourts,
  numRounds,
  genderedEnabled,
  genderedFrequency,
  onTogglePlayer,
  onSelectAll,
  onDeselectAll,
  onCourtsChange,
  onRoundsChange,
  onGenderedToggle,
  onGenderedFrequencyChange,
  onGenerate,
  onBack,
}: Props) {
  const playersNeeded = numCourts * 4;
  const notEnoughPlayers = selectedIds.length < playersNeeded;
  const canGenerate = selectedIds.length >= 4 && !notEnoughPlayers;

  return (
    <div className="space-y-6">
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

      <div className="flex justify-end">
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="px-6 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generate Schedule
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <PlayerSelector
          players={players}
          selectedIds={selectedIds}
          onToggle={onTogglePlayer}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
        />
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          &larr; Back to Roster
        </button>
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="px-6 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generate Schedule
        </button>
      </div>
      {!canGenerate && selectedIds.length > 0 && (
        <p className="text-red-600 text-sm text-right">
          {selectedIds.length < 4
            ? 'Select at least 4 players to generate a schedule'
            : `Need at least ${playersNeeded} players for ${numCourts} courts (have ${selectedIds.length})`}
        </p>
      )}
    </div>
  );
}
