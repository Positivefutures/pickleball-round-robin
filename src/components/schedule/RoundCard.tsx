import type { Round, Player, LockedPair } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { CourtMatchup } from './CourtMatchup';
import { SitOutList } from './SitOutList';
import { ROUND_TYPE_META, courtMatchesType, roundTypeOf } from '../../lib/roundTypes';

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
  /** Opens the box for renaming a court in this round. */
  onEditCourtNumber: (courtIdx: number) => void;
  /** Whether this session keeps score. */
  scoringEnabled: boolean;
  /** Opens the box for writing down a court's score. */
  onEditScore: (courtIdx: number) => void;
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
  onEditCourtNumber,
  scoringEnabled,
  onEditScore,
}: Props) {
  // A completed round collapses by default and can only be viewed, not edited.
  const showBody = !isComplete || isExpanded;
  const roundType = roundTypeOf(round);
  const typeBadge = roundType && (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded ${ROUND_TYPE_META[roundType].badgeClass}`}
    >
      {ROUND_TYPE_META[roundType].badge}
    </span>
  );

  return (
    <div
      className={`round-card rounded-lg shadow border border-[#ddd] px-[0.6rem] pt-[0.83rem] pb-[1.2rem] ${
        isComplete ? 'bg-gray-50' : 'bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h3
              className={`text-[1.35rem] font-extrabold uppercase ${isComplete ? 'text-gray-500' : 'text-[#222]'}`}
            >
              Round {round.roundNumber}
            </h3>
            {/* A completed round also carries View/Hide, which leaves no room
                for the badge alongside — it drops to its own line instead. */}
            {!isComplete && typeBadge}
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
          {isComplete && typeBadge && <div className="mt-1">{typeBadge}</div>}
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
          Completed
          <input
            type="checkbox"
            checked={isComplete}
            disabled={isComplete && !canUncomplete}
            onChange={onToggleComplete}
            className="w-4 h-4 accent-green-600 disabled:cursor-default"
          />
        </label>
      </div>

      {showBody && (
        <>
          {/* The line changes with scoring on, because the plain one would be a
              lie: the players are fixed but the board is still live. */}
          {isComplete && (
            <p className="text-xs text-gray-500 italic mt-3 no-print">
              {scoringEnabled
                ? 'This round is complete. Scores can still be changed.'
                : 'This round is complete and can no longer be edited.'}
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
                  // Keyed by position, not by number: two courts in a round may
                  // now carry the same one while the host is part way through
                  // renaming them.
                  key={courtIdx}
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
                  offFormat={!!roundType && !courtMatchesType(court, roundType)}
                  onEditNumber={() => onEditCourtNumber(courtIdx)}
                showScore={scoringEnabled}
                onEditScore={() => onEditScore(courtIdx)}
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
