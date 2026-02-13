interface Props {
  numCourts: number;
  numRounds: number;
  onCourtsChange: (n: number) => void;
  onRoundsChange: (n: number) => void;
  numPlayers: number;
  genderedEnabled: boolean;
  genderedFrequency: number;
  onGenderedToggle: (enabled: boolean) => void;
  onGenderedFrequencyChange: (n: number) => void;
}

export function SessionConfig({
  numCourts,
  numRounds,
  onCourtsChange,
  onRoundsChange,
  numPlayers,
  genderedEnabled,
  genderedFrequency,
  onGenderedToggle,
  onGenderedFrequencyChange,
}: Props) {
  const maxCourts = Math.floor(numPlayers / 4);
  const spotsNeeded = numCourts * 4;
  const sitOutsPerRound = Math.max(0, numPlayers - spotsNeeded);

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
              className="w-9 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
            >
              &minus;
            </button>
            <span className="w-10 text-center font-medium text-gray-800">{numCourts}</span>
            <button
              type="button"
              onClick={() => onCourtsChange(Math.min(16, numCourts + 1))}
              className="w-9 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
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
              className="w-9 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
            >
              &minus;
            </button>
            <span className="w-10 text-center font-medium text-gray-800">{numRounds}</span>
            <button
              type="button"
              onClick={() => onRoundsChange(Math.min(16, numRounds + 1))}
              className="w-9 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
            >
              +
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Play Gendered Games?
          </label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="gendered"
                checked={!genderedEnabled}
                onChange={() => onGenderedToggle(false)}
                className="text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-gray-700">No</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="gendered"
                checked={genderedEnabled}
                onChange={() => onGenderedToggle(true)}
                className="text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-gray-700">Yes</span>
            </label>
            {genderedEnabled && (
              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-sm text-gray-700">Every</span>
                <select
                  value={genderedFrequency}
                  onChange={(e) => onGenderedFrequencyChange(parseInt(e.target.value))}
                  className="w-14 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                >
                  {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-sm text-gray-700">Rounds</span>
              </div>
            )}
          </div>
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
