import type { Round, Player, LockedPair } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { CourtMatchup } from './CourtMatchup';
import { SitOutList } from './SitOutList';

interface Props {
  round: Round;
  roundIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  allPlayers: Player[];
  locks: LockedPair[];
  onToggleLock: (roundIdx: number, courtIdx: number, team: 'team1' | 'team2') => void;
  onRequestRemove: (player: Player) => void;
  isComplete: boolean;
  isExpanded: boolean;
  canUncomplete: boolean;
  onToggleComplete: () => void;
  onToggleExpand: () => void;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="#6b7280"
      className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
    >
      <path d="M12 15.5l-6-6L7.4 8l4.6 4.6L16.6 8 18 9.5z" />
    </svg>
  );
}

export function RoundCard({
  round,
  roundIdx,
  selectedSlot,
  onPlayerTap,
  allPlayers,
  locks,
  onToggleLock,
  onRequestRemove,
  isComplete,
  isExpanded,
  canUncomplete,
  onToggleComplete,
  onToggleExpand,
}: Props) {
  // A completed round collapses by default and can only be viewed, not edited.
  const showBody = !isComplete || isExpanded;

  return (
    <div
      className={`round-card rounded-lg shadow p-6 ${
        isComplete ? 'bg-gray-50 border border-gray-200' : 'bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3
            className={`text-lg font-bold ${isComplete ? 'text-gray-500' : 'text-gray-800'}`}
          >
            Round {round.roundNumber}
          </h3>
          {round.isGendered && (
            <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
              Gendered Round
            </span>
          )}
          {isComplete && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors no-print"
              aria-expanded={isExpanded}
            >
              {isExpanded ? 'Hide' : 'View'}
              <ChevronIcon expanded={isExpanded} />
            </button>
          )}
        </div>

        <label
          className={`flex items-center gap-2 text-sm font-medium select-none no-print ${
            isComplete && !canUncomplete
              ? 'text-gray-400 cursor-default'
              : 'text-gray-600 cursor-pointer'
          }`}
          title={
            isComplete && !canUncomplete
              ? 'Completed rounds are locked once a player has been removed'
              : undefined
          }
        >
          <input
            type="checkbox"
            checked={isComplete}
            disabled={isComplete && !canUncomplete}
            onChange={onToggleComplete}
            className="w-4 h-4 accent-green-600 disabled:cursor-default"
          />
          Complete
        </label>
      </div>

      {showBody && (
        <>
          {isComplete && (
            <p className="text-xs text-gray-500 italic mt-3 no-print">
              This round is complete and can no longer be edited.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {round.courts.map((court, courtIdx) => {
              const lockedTeams = {
                team1: locks.some((lp) => lp.courtIdx === courtIdx && lp.team === 'team1'),
                team2: locks.some((lp) => lp.courtIdx === courtIdx && lp.team === 'team2'),
              };
              return (
                <CourtMatchup
                  key={court.courtNumber}
                  court={court}
                  roundIdx={roundIdx}
                  courtIdx={courtIdx}
                  selectedSlot={selectedSlot}
                  onPlayerTap={onPlayerTap}
                  allPlayers={allPlayers}
                  lockedTeams={lockedTeams}
                  onToggleLock={onToggleLock}
                  onRequestRemove={onRequestRemove}
                  readOnly={isComplete}
                />
              );
            })}
          </div>
          <SitOutList
            players={round.sitOuts}
            roundIdx={roundIdx}
            selectedSlot={selectedSlot}
            onPlayerTap={onPlayerTap}
            onRequestRemove={onRequestRemove}
            allPlayers={allPlayers}
            readOnly={isComplete}
          />
        </>
      )}
    </div>
  );
}
