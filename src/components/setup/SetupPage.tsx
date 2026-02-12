import type { Player } from '../../types';
import { PlayerSelector } from './PlayerSelector';
import { SessionConfig } from './SessionConfig';

interface Props {
  players: Player[];
  selectedIds: string[];
  numCourts: number;
  numRounds: number;
  onTogglePlayer: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCourtsChange: (n: number) => void;
  onRoundsChange: (n: number) => void;
  onGenerate: () => void;
  onBack: () => void;
}

export function SetupPage({
  players,
  selectedIds,
  numCourts,
  numRounds,
  onTogglePlayer,
  onSelectAll,
  onDeselectAll,
  onCourtsChange,
  onRoundsChange,
  onGenerate,
  onBack,
}: Props) {
  const canGenerate = selectedIds.length >= 4;

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
        />
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
        <p className="text-amber-600 text-sm text-right">
          Select at least 4 players to generate a schedule
        </p>
      )}
    </div>
  );
}
