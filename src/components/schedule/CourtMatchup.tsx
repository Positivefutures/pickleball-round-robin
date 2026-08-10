import type { CourtAssignment, Player } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { getDisplayName } from '../../utils/helpers';
import { BalanceIndicator } from './BalanceIndicator';
import { TrashIcon } from './icons';

interface Props {
  court: CourtAssignment;
  roundIdx: number;
  courtIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  allPlayers: Player[];
  lockedTeams: { team1: boolean; team2: boolean };
  onToggleLock: (roundIdx: number, courtIdx: number, team: 'team1' | 'team2') => void;
  onRequestRemove: (player: Player) => void;
  readOnly?: boolean;
  /** A court on a special round that the roster could not fill in that format. */
  offFormat?: boolean;
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

interface TeamStyles {
  bgClass: string;
  borderClass: string;
  hoverClass: string;
  selectedBgClass: string;
}

function PlayerButton({
  player,
  playerIdx,
  teamKey,
  locked,
  roundIdx,
  courtIdx,
  selected,
  onPlayerTap,
  onRequestRemove,
  allPlayers,
  readOnly,
  styles,
}: {
  player: Player;
  playerIdx: number;
  teamKey: 'team1' | 'team2';
  locked: boolean;
  roundIdx: number;
  courtIdx: number;
  selected: boolean;
  onPlayerTap: (slot: PlayerSlot) => void;
  onRequestRemove: (player: Player) => void;
  allPlayers: Player[];
  readOnly: boolean;
  styles: TeamStyles;
}) {
  const { bgClass, borderClass, hoverClass, selectedBgClass } = styles;
  // Locked players cannot be tapped for swap; completed rounds are frozen entirely
  const interactive = !locked && !readOnly;
  const displayName = getDisplayName(player, allPlayers);

  return (
    <button
      type="button"
      onClick={() =>
        interactive && onPlayerTap({ kind: 'court', roundIdx, courtIdx, team: teamKey, playerIdx })
      }
      className={`w-full flex justify-between items-center text-sm px-3 py-2 rounded-md transition-colors ${
        locked
          ? `${bgClass} border-2 border-black`
          : selected
            ? `${selectedBgClass} border-blue-500 ring-2 ring-blue-500 border`
            : `${bgClass} ${borderClass} ${hoverClass} border`
      }${interactive ? '' : ' cursor-default'}`}
    >
      {/* One line, cut with an ellipsis. A name long enough to wrap used to
          make its court taller than the one beside it, and a grid of courts
          that no longer lines up is harder to read than a shortened name. The
          title carries the whole of it. */}
      <span className="min-w-0 flex-1 truncate text-left font-medium" title={displayName}>
        {displayName}
      </span>
      {selected && interactive ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Remove ${player.name}`}
          title={`Remove ${player.name}`}
          // Stop propagation so this doesn't register as the second tap of a swap
          onClick={(e) => {
            e.stopPropagation();
            onRequestRemove(player);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onRequestRemove(player);
            }
          }}
          className="shrink-0 p-0.5 -mr-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer"
        >
          <TrashIcon />
        </span>
      ) : (
        <span className="shrink-0 pl-2 text-gray-500">{player.rating.toFixed(1)}</span>
      )}
    </button>
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
  onRequestRemove,
  allPlayers,
  readOnly,
  styles,
}: {
  team: Player[];
  teamKey: 'team1' | 'team2';
  locked: boolean;
  roundIdx: number;
  courtIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  onToggleLock: (roundIdx: number, courtIdx: number, team: 'team1' | 'team2') => void;
  onRequestRemove: (player: Player) => void;
  allPlayers: Player[];
  readOnly: boolean;
  styles: TeamStyles;
}) {
  function isSelected(playerIdx: number) {
    return (
      selectedSlot?.kind === 'court' &&
      selectedSlot.roundIdx === roundIdx &&
      selectedSlot.courtIdx === courtIdx &&
      selectedSlot.team === teamKey &&
      selectedSlot.playerIdx === playerIdx
    );
  }

  return (
    // min-w-0 or the column refuses to go narrower than the longest name in
    // it, and the court grows sideways off the screen instead of the name
    // being cut. A flex item is min-width: auto until told otherwise.
    <div className="min-w-0 flex-1 flex flex-col items-center gap-1">
      {team[0] && (
        <PlayerButton
          key={team[0].id}
          player={team[0]}
          playerIdx={0}
          teamKey={teamKey}
          locked={locked}
          roundIdx={roundIdx}
          courtIdx={courtIdx}
          selected={isSelected(0)}
          onPlayerTap={onPlayerTap}
          onRequestRemove={onRequestRemove}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={styles}
        />
      )}

      {team.length === 2 && !readOnly && (
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
        <PlayerButton
          key={team[1].id}
          player={team[1]}
          playerIdx={1}
          teamKey={teamKey}
          locked={locked}
          roundIdx={roundIdx}
          courtIdx={courtIdx}
          selected={isSelected(1)}
          onPlayerTap={onPlayerTap}
          onRequestRemove={onRequestRemove}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={styles}
        />
      )}
    </div>
  );
}

const TEAM1_STYLES: TeamStyles = {
  bgClass: 'bg-blue-50',
  borderClass: 'border-blue-200',
  hoverClass: 'hover:bg-blue-100',
  selectedBgClass: 'bg-blue-200',
};

const TEAM2_STYLES: TeamStyles = {
  bgClass: 'bg-orange-50',
  borderClass: 'border-orange-200',
  hoverClass: 'hover:bg-orange-100',
  selectedBgClass: 'bg-orange-200',
};

export function CourtMatchup({ court, roundIdx, courtIdx, selectedSlot, onPlayerTap, allPlayers, lockedTeams, onToggleLock, onRequestRemove, readOnly = false, offFormat = false }: Props) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-gray-700">Court {court.courtNumber}</h4>
          {offFormat && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600"
              title="There were not enough players left to fill this court in the round's format, so it plays an ordinary game."
            >
              Normal game
            </span>
          )}
        </div>
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
          onRequestRemove={onRequestRemove}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={TEAM1_STYLES}
        />

        {/* Sits in the gap between the two columns, centred against the taller one */}
        <span className="self-center shrink-0 text-xs font-medium text-gray-400">Vs.</span>

        <TeamColumn
          team={court.team2}
          teamKey="team2"
          locked={lockedTeams.team2}
          roundIdx={roundIdx}
          courtIdx={courtIdx}
          selectedSlot={selectedSlot}
          onPlayerTap={onPlayerTap}
          onToggleLock={onToggleLock}
          onRequestRemove={onRequestRemove}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={TEAM2_STYLES}
        />
      </div>
    </div>
  );
}
