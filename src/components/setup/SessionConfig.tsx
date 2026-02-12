interface Props {
  numCourts: number;
  numRounds: number;
  onCourtsChange: (n: number) => void;
  onRoundsChange: (n: number) => void;
  numPlayers: number;
}

export function SessionConfig({
  numCourts,
  numRounds,
  onCourtsChange,
  onRoundsChange,
  numPlayers,
}: Props) {
  const maxCourts = Math.min(5, Math.floor(numPlayers / 4));
  const spotsNeeded = numCourts * 4;
  const sitOutsPerRound = Math.max(0, numPlayers - spotsNeeded);

  return (
    <div className="space-y-4">
      <div className="flex gap-6 flex-wrap">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Courts
          </label>
          <input
            type="number"
            value={numCourts}
            onChange={(e) => onCourtsChange(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
            min="1"
            max="5"
            className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Rounds
          </label>
          <input
            type="number"
            value={numRounds}
            onChange={(e) => onRoundsChange(Math.max(1, parseInt(e.target.value) || 1))}
            min="1"
            className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      {numPlayers > 0 && (
        <div className="text-sm space-y-1">
          <p className="text-gray-600">
            {spotsNeeded} spots available ({numCourts} courts &times; 4 players)
          </p>
          {sitOutsPerRound > 0 && (
            <p className="text-amber-600">
              {sitOutsPerRound} player{sitOutsPerRound > 1 ? 's' : ''} will sit out each round (rotated fairly)
            </p>
          )}
          {numCourts > maxCourts && maxCourts > 0 && (
            <p className="text-amber-600">
              Not enough players to fill {numCourts} courts. Will use {maxCourts} court{maxCourts > 1 ? 's' : ''}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
