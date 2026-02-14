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
  lockedTeams: { team1: boolean; team2: boolean };
  onToggleLock: (roundIdx: number, courtIdx: number, team: 'team1' | 'team2') => void;
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={locked ? '#000000' : '#d1d5db'}
      className="w-4 h-4"
    >
      {locked ? (
        <path d="M12 2C9.24 2 7 4.24 7 7v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7c0-2.76-2.24-5-5-5zm-3 5c0-1.66 1.34-3 3-3s3 1.34 3 3v3H9V7z" />
      ) : (
        <path d="M12 2C9.24 2 7 4.24 7 7v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-7V7c0-1.66 1.34-3 3-3s3 1.34 3 3v1h2V7c0-2.76-2.24-5-5-5z" />
      )}
    </svg>
  );
}

function TeamColumn({
  team,
  teamKey,
  locked,
  roundIdx,
  courtIdx,
  selectedSlot,
  onPlayerTap,
  onToggleLock,
  allPlayers,
  bgClass,
  borderClass,
  hoverClass,
  selectedBgClass,
}: {
  team: Player[];
  teamKey: 'team1' | 'team2';
  locked: boolean;
  roundIdx: number;
  courtIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  onToggleLock: (roundIdx: number, courtIdx: number, team: 'team1' | 'team2') => void;
  allPlayers: Player[];
  bgClass: string;
  borderClass: string;
  hoverClass: string;
  selectedBgClass: string;
}) {
  function isSelected(playerIdx: number) {
    return (
      selectedSlot?.roundIdx === roundIdx &&
      selectedSlot?.courtIdx === courtIdx &&
      selectedSlot?.team === teamKey &&
      selectedSlot?.playerIdx === playerIdx
    );
  }

  function handlePlayerClick(playerIdx: number) {
    if (locked) return; // locked players cannot be tapped for swap
    onPlayerTap({ roundIdx, courtIdx, team: teamKey, playerIdx });
  }

  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      {team[0] && (
        <button
          key={team[0].id}
          type="button"
          onClick={() => handlePlayerClick(0)}
          className={`w-full flex justify-between items-center text-sm px-3 py-2 rounded-md transition-colors ${
            locked
              ? `${bgClass} border-2 border-black`
              : isSelected(0)
                ? `${selectedBgClass} border-blue-500 ring-2 ring-blue-500 border`
                : `${bgClass} ${borderClass} ${hoverClass} border`
          }${locked ? ' cursor-default' : ''}`}
        >
          <span className="font-medium">{getDisplayName(team[0], allPlayers)}</span>
          <span className="text-gray-500">{team[0].rating.toFixed(1)}</span>
        </button>
      )}

      {team.length === 2 && (
        <button
          type="button"
          onClick={() => onToggleLock(roundIdx, courtIdx, teamKey)}
          className="self-center -my-0.5 z-10 p-0.5 rounded hover:bg-gray-100 transition-colors"
          aria-label={locked ? 'Unlock pair' : 'Lock pair'}
        >
          <LockIcon locked={locked} />
        </button>
      )}

      {team[1] && (
        <button
          key={team[1].id}
          type="button"
          onClick={() => handlePlayerClick(1)}
          className={`w-full flex justify-between items-center text-sm px-3 py-2 rounded-md transition-colors ${
            locked
              ? `${bgClass} border-2 border-black`
              : isSelected(1)
                ? `${selectedBgClass} border-blue-500 ring-2 ring-blue-500 border`
                : `${bgClass} ${borderClass} ${hoverClass} border`
          }${locked ? ' cursor-default' : ''}`}
        >
          <span className="font-medium">{getDisplayName(team[1], allPlayers)}</span>
          <span className="text-gray-500">{team[1].rating.toFixed(1)}</span>
        </button>
      )}
    </div>
  );
}

export function CourtMatchup({ court, roundIdx, courtIdx, selectedSlot, onPlayerTap, allPlayers, lockedTeams, onToggleLock }: Props) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold text-gray-700">Court {court.courtNumber}</h4>
        <BalanceIndicator ratingDiff={court.ratingDiff} />
      </div>

      <div className="flex items-start gap-2">
        <TeamColumn
          team={court.team1}
          teamKey="team1"
          locked={lockedTeams.team1}
          roundIdx={roundIdx}
          courtIdx={courtIdx}
          selectedSlot={selectedSlot}
          onPlayerTap={onPlayerTap}
          onToggleLock={onToggleLock}
          allPlayers={allPlayers}
          bgClass="bg-blue-50"
          borderClass="border-blue-200"
          hoverClass="hover:bg-blue-100"
          selectedBgClass="bg-blue-200"
        />

        <TeamColumn
          team={court.team2}
          teamKey="team2"
          locked={lockedTeams.team2}
          roundIdx={roundIdx}
          courtIdx={courtIdx}
          selectedSlot={selectedSlot}
          onPlayerTap={onPlayerTap}
          onToggleLock={onToggleLock}
          allPlayers={allPlayers}
          bgClass="bg-orange-50"
          borderClass="border-orange-200"
          hoverClass="hover:bg-orange-100"
          selectedBgClass="bg-orange-200"
        />
      </div>
    </div>
  );
}
