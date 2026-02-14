import type { Round, Player } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { CourtMatchup } from './CourtMatchup';
import { SitOutList } from './SitOutList';

interface Props {
  round: Round;
  roundIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  allPlayers: Player[];
}

export function RoundCard({ round, roundIdx, selectedSlot, onPlayerTap, allPlayers }: Props) {
  return (
    <div className="round-card bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-bold text-gray-800">
          Round {round.roundNumber}
        </h3>
        {round.isGendered && (
          <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
            Gendered Round
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {round.courts.map((court, courtIdx) => (
          <CourtMatchup
            key={court.courtNumber}
            court={court}
            roundIdx={roundIdx}
            courtIdx={courtIdx}
            selectedSlot={selectedSlot}
            onPlayerTap={onPlayerTap}
            allPlayers={allPlayers}
          />
        ))}
      </div>
      <SitOutList players={round.sitOuts} />
    </div>
  );
}
