import type { SpecialGameTypes } from '../../types';
import { summaryLines } from '../../lib/roundTypes';

interface Props {
  numCourts: number;
  numRounds: number;
  onCourtsChange: (n: number) => void;
  onRoundsChange: (n: number) => void;
  numPlayers: number;
  specialTypes: SpecialGameTypes;
  onOpenSpecialTypes: () => void;
}

export function SessionConfig({
  numCourts,
  numRounds,
  onCourtsChange,
  onRoundsChange,
  numPlayers,
  specialTypes,
  onOpenSpecialTypes,
}: Props) {
  const spotsNeeded = numCourts * 4;
  const sitOutsPerRound = Math.max(0, numPlayers - spotsNeeded);
  const specials = summaryLines(specialTypes);

  return (
    <div className="space-y-4">
      <div className="flex gap-6 flex-wrap items-start">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Courts
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onCourtsChange(Math.max(1, numCourts - 1))}
              className="min-w-9 min-h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
            >
              &minus;
            </button>
            <span className="min-w-10 text-center font-medium text-gray-800">{numCourts}</span>
            <button
              type="button"
              onClick={() => onCourtsChange(Math.min(16, numCourts + 1))}
              className="min-w-9 min-h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
            >
              +
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Rounds
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onRoundsChange(Math.max(1, numRounds - 1))}
              className="min-w-9 min-h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
            >
              &minus;
            </button>
            <span className="min-w-10 text-center font-medium text-gray-800">{numRounds}</span>
            <button
              type="button"
              onClick={() => onRoundsChange(Math.min(16, numRounds + 1))}
              className="min-w-9 min-h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div>
        {specials.length > 0 && (
          <div className="mb-2">
            <h3 className="text-lg font-semibold text-gray-800">Special Game Types</h3>
            {specials.map((line) => (
              <p key={line} className="text-sm text-gray-700">{line}</p>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onOpenSpecialTypes}
          className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Select Special Game Types
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-base font-bold text-gray-700">
          {numPlayers} of {spotsNeeded} Spots Filled
        </p>
        {sitOutsPerRound > 0 && (
          <p className="text-sm text-amber-600">
            {sitOutsPerRound} player{sitOutsPerRound > 1 ? 's' : ''} will sit out each round
          </p>
        )}
      </div>
    </div>
  );
}
