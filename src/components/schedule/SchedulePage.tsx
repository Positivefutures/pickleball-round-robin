import type { Schedule, Player } from '../../types';
import { RoundCard } from './RoundCard';
import { PartnerSummary } from './PartnerSummary';

interface Props {
  schedule: Schedule;
  players: Player[];
  onRegenerate: () => void;
  onBack: () => void;
}

export function SchedulePage({ schedule, players, onRegenerate, onBack }: Props) {
  return (
    <div className="space-y-6 no-print">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          &larr; Back to Setup
        </button>
        <div className="flex gap-3">
          <button
            onClick={onRegenerate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Regenerate
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {schedule.rounds.map((round) => (
        <RoundCard key={round.roundNumber} round={round} />
      ))}

      <PartnerSummary schedule={schedule} players={players} />
    </div>
  );
}
