import type { Round } from '../../types';
import { CourtMatchup } from './CourtMatchup';
import { SitOutList } from './SitOutList';

interface Props {
  round: Round;
}

export function RoundCard({ round }: Props) {
  return (
    <div className="round-card bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4">
        Round {round.roundNumber}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {round.courts.map((court) => (
          <CourtMatchup key={court.courtNumber} court={court} />
        ))}
      </div>
      <SitOutList players={round.sitOuts} />
    </div>
  );
}
