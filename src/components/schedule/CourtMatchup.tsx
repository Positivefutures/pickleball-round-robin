import type { CourtAssignment, Player } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { getDisplayName } from '../../utils/helpers';
import { BalanceIndicator } from './BalanceIndicator';

interface Props {
  court: CourtAssignment;
  roundIdx: number;
  courtIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  allPlayers: Player[];
}

export function CourtMatchup({ court, roundIdx, courtIdx, selectedSlot, onPlayerTap, allPlayers }: Props) {
  function isSelected(team: 'team1' | 'team2', playerIdx: number) {
    return (
      selectedSlot?.roundIdx === roundIdx &&
      selectedSlot?.courtIdx === courtIdx &&
      selectedSlot?.team === team &&
      selectedSlot?.playerIdx === playerIdx
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold text-gray-700">Court {court.courtNumber}</h4>
        <BalanceIndicator ratingDiff={court.ratingDiff} />
      </div>

      <div className="flex items-start gap-2">
        <div className="flex-1 flex flex-col gap-1">
          {court.team1.map((p, pi) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPlayerTap({ roundIdx, courtIdx, team: 'team1', playerIdx: pi })}
              className={`w-full flex justify-between items-center text-sm px-3 py-2 rounded-md border transition-colors ${
                isSelected('team1', pi)
                  ? 'bg-blue-200 border-blue-500 ring-2 ring-blue-500'
                  : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
              }`}
            >
              <span className="font-medium">{getDisplayName(p, allPlayers)}</span>
              <span className="text-gray-500">{p.rating.toFixed(1)}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col gap-1">
          {court.team2.map((p, pi) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPlayerTap({ roundIdx, courtIdx, team: 'team2', playerIdx: pi })}
              className={`w-full flex justify-between items-center text-sm px-3 py-2 rounded-md border transition-colors ${
                isSelected('team2', pi)
                  ? 'bg-orange-200 border-blue-500 ring-2 ring-blue-500'
                  : 'bg-orange-50 border-orange-200 hover:bg-orange-100'
              }`}
            >
              <span className="font-medium">{getDisplayName(p, allPlayers)}</span>
              <span className="text-gray-500">{p.rating.toFixed(1)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
