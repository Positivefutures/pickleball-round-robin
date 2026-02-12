import type { CourtAssignment } from '../../types';
import { sumRatings } from '../../utils/helpers';
import { BalanceIndicator } from './BalanceIndicator';

interface Props {
  court: CourtAssignment;
}

export function CourtMatchup({ court }: Props) {
  const team1Rating = sumRatings(court.team1);
  const team2Rating = sumRatings(court.team2);

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold text-gray-700">Court {court.courtNumber}</h4>
        <BalanceIndicator ratingDiff={court.ratingDiff} />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 bg-blue-50 rounded-md p-3">
          <div className="text-xs text-blue-600 font-medium mb-1">Team A</div>
          {court.team1.map((p) => (
            <div key={p.id} className="flex justify-between text-sm">
              <span className="font-medium">{p.name} <span className="text-gray-400 text-xs">({p.gender})</span></span>
              <span className="text-gray-500">{p.rating.toFixed(1)}</span>
            </div>
          ))}
          <div className="text-xs text-blue-500 mt-1 font-medium border-t border-blue-200 pt-1">
            Total: {team1Rating.toFixed(1)}
          </div>
        </div>

        <div className="text-gray-400 font-bold text-lg">vs</div>

        <div className="flex-1 bg-orange-50 rounded-md p-3">
          <div className="text-xs text-orange-600 font-medium mb-1">Team B</div>
          {court.team2.map((p) => (
            <div key={p.id} className="flex justify-between text-sm">
              <span className="font-medium">{p.name} <span className="text-gray-400 text-xs">({p.gender})</span></span>
              <span className="text-gray-500">{p.rating.toFixed(1)}</span>
            </div>
          ))}
          <div className="text-xs text-orange-500 mt-1 font-medium border-t border-orange-200 pt-1">
            Total: {team2Rating.toFixed(1)}
          </div>
        </div>
      </div>
    </div>
  );
}
