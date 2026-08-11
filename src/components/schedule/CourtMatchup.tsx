import type { CourtAssignment, Player } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { getDisplayName } from '../../utils/helpers';
import { BalanceIndicator } from './BalanceIndicator';
import { EditPlayerButton } from './EditPlayerButton';
import { GuestChip } from './GuestChip';
import { GenderMark } from './GenderMark';
import { Scoreboard } from './Scoreboard';

interface Props {
  court: CourtAssignment;
  roundIdx: number;
  courtIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  allPlayers: Player[];
  lockedTeams: { team1: boolean; team2: boolean };
  onToggleLock: (roundIdx: number, courtIdx: number, team: 'team1' | 'team2') => void;
  onOpenPlayerMenu: (player: Player) => void;
  readOnly?: boolean;
  /** A court on a special round that the roster could not fill in that format. */
  offFormat?: boolean;
  /** Whether this round's format is built out of who is a man and who a woman. */
  showGender?: boolean;
  /** Opens the box for renaming this court. Absent on a round that cannot be edited. */
  onEditNumber?: () => void;
  /** Whether this session keeps score. Off, and the board is not drawn at all. */
  showScore?: boolean;
  /** Opens the box for writing the score down. */
  onEditScore?: () => void;
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
  onOpenPlayerMenu,
  allPlayers,
  readOnly,
  styles,
  showGender,
}: {
  player: Player;
  playerIdx: number;
  teamKey: 'team1' | 'team2';
  locked: boolean;
  roundIdx: number;
  courtIdx: number;
  selected: boolean;
  onPlayerTap: (slot: PlayerSlot) => void;
  onOpenPlayerMenu: (player: Player) => void;
  allPlayers: Player[];
  readOnly: boolean;
  styles: TeamStyles;
  showGender: boolean;
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
      {showGender && <GenderMark player={player} />}
      {/* One line, cut with an ellipsis. A name long enough to wrap used to
          make its court taller than the one beside it, and a grid of courts
          that no longer lines up is harder to read than a shortened name. The
          title carries the whole of it. */}
      <span
        className={`min-w-0 flex-1 truncate text-left font-medium${showGender ? ' pl-1' : ''}`}
        title={displayName}
      >
        {displayName}
      </span>
      <GuestChip player={player} />
      {selected && interactive ? (
        <EditPlayerButton player={player} onOpen={onOpenPlayerMenu} />
      ) : (
        <span className="shrink-0 pl-2 text-gray-500">{player.rating.toFixed(1)}</span>
      )}
    </button>
  );
}

/**
 * A place on a court with nobody in it.
 *
 * Every court draws four places whatever the roster managed to fill, and this is
 * what one of them looks like when it is going spare. It is a button like any
 * other place: tap it, then tap somebody sitting out and they take it, or tap
 * somebody on a full court and the two places change hands.
 *
 * Dashed and grey so it reads as a gap rather than a player, but it must not
 * look disabled, because it is the thing the host is meant to press.
 */
function EmptyPlace({
  selected,
  courtNumber,
  readOnly,
  onTap,
}: {
  selected: boolean;
  courtNumber: number;
  readOnly: boolean;
  onTap: () => void;
}) {
  const base =
    'w-full text-sm px-3 py-2 rounded-md text-left font-medium border border-dashed transition-colors';
  return (
    <button
      type="button"
      onClick={() => !readOnly && onTap()}
      aria-label={`Empty place on court ${courtNumber}`}
      className={
        selected
          ? `${base} border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500`
          : `${base} border-gray-300 bg-gray-50 text-gray-400${
              readOnly ? ' cursor-default' : ' hover:bg-gray-100 hover:text-gray-500'
            }`
      }
    >
      EMPTY
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
  onOpenPlayerMenu,
  allPlayers,
  readOnly,
  styles,
  lockRow,
  courtNumber,
  showGender,
}: {
  team: Player[];
  teamKey: 'team1' | 'team2';
  locked: boolean;
  roundIdx: number;
  courtIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  onToggleLock: (roundIdx: number, courtIdx: number, team: 'team1' | 'team2') => void;
  onOpenPlayerMenu: (player: Player) => void;
  allPlayers: Player[];
  readOnly: boolean;
  styles: TeamStyles;
  /**
   * Whether a padlock row is drawn on this court at all. Only one side of a 2v1
   * has a pair to hold together, so the other side draws a gap the same height
   * and the four places stay level across the court.
   */
  lockRow: boolean;
  courtNumber: number;
  showGender: boolean;
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

  const emptySelected =
    selectedSlot?.kind === 'empty' &&
    selectedSlot.roundIdx === roundIdx &&
    selectedSlot.courtIdx === courtIdx &&
    selectedSlot.team === teamKey;

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
          onOpenPlayerMenu={onOpenPlayerMenu}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={styles}
          showGender={showGender}
        />
      )}

      {lockRow &&
        (team.length === 2 ? (
          <button
            type="button"
            onClick={() => onToggleLock(roundIdx, courtIdx, teamKey)}
            className="self-center -my-0.5 z-10 p-0.5 rounded hover:bg-gray-100 transition-colors"
            aria-label={locked ? 'Unlock pair' : 'Lock pair'}
          >
            <LockIcon locked={locked} />
          </button>
        ) : (
          <div aria-hidden="true" className="self-center -my-0.5 p-0.5 w-4 h-4" />
        ))}

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
          onOpenPlayerMenu={onOpenPlayerMenu}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={styles}
          showGender={showGender}
        />
      )}

      {/* Two places to a side, always. Whatever the roster could not fill is
          drawn as a gap somebody can be tapped into. */}
      {team.length < 2 && (
        <EmptyPlace
          selected={emptySelected}
          courtNumber={courtNumber}
          readOnly={readOnly}
          onTap={() => onPlayerTap({ kind: 'empty', roundIdx, courtIdx, team: teamKey })}
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

export function CourtMatchup({ court, roundIdx, courtIdx, selectedSlot, onPlayerTap, allPlayers, lockedTeams, onToggleLock, onOpenPlayerMenu, readOnly = false, offFormat = false, showGender = false, onEditNumber, showScore = false, onEditScore }: Props) {
  // Written out in capitals rather than set in them, so the printed sheet, the
  // PDF and the screen all say the same thing and a test can read it back.
  const label = `COURT ${court.courtNumber}`;
  const canEdit = !readOnly && !!onEditNumber;

  // Four places whatever the roster managed to fill, so the ones going spare can
  // be tapped and somebody put in them.
  const courtSize = court.team1.length + court.team2.length;

  // A padlock needs a pair to hold. On a 2v1 that is one side only, and on a
  // game of singles neither, which is why the row is drawn per court rather
  // than per side — the gap on the other side keeps the places level.
  const lockRow = !readOnly && (court.team1.length === 2 || court.team2.length === 2);

  // Diff compares one side against the other, and a 2v1 has no comparison worth
  // making: one player covering a whole court is not half a pair. The number
  // still exists, averaged, because the scheduler balances on it — it is only
  // the badge that would invite the wrong reading.
  const showBalance = courtSize !== 3;

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center gap-2 mb-3">
        <div className="flex items-center gap-2">
          {/* Still a heading either way. On a round that can be edited it holds
              a button, because the number is the host's to set: a centre gives
              out courts 7, 8 and 9, and the app cannot know that. The dotted
              underline is the only hint that it opens something. */}
          <h4 className="font-bold text-gray-700">
            {canEdit ? (
              <button
                type="button"
                onClick={onEditNumber}
                aria-haspopup="dialog"
                title="Change this court number"
                className="underline decoration-dotted decoration-gray-400 underline-offset-4 hover:text-gray-900 transition-colors"
              >
                {label}
              </button>
            ) : (
              label
            )}
          </h4>
          {offFormat && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600"
              title="There were not enough players left to fill this court in the round's format, so it plays an ordinary game."
            >
              Normal game
            </span>
          )}
        </div>

        {/* On the header line, between the court's name and its balance, because
            that row is where a card says what it is rather than who is on it.

            Not gated on readOnly, unlike everything else on this card. Writing
            the score down after a round has been played is the ordinary case,
            not the exception. Screen only: the sheet is read out before the
            games, when there is nothing to write down yet.

            A court with nobody on one side is a place waiting for players and
            has no game to give a score to. */}
        {showScore && court.team1.length > 0 && court.team2.length > 0 && (
          <div className="no-print flex flex-1 justify-center">
            <Scoreboard
              score={court.score}
              courtNumber={court.courtNumber}
              onTap={onEditScore}
            />
          </div>
        )}

        {showBalance && <BalanceIndicator ratingDiff={court.ratingDiff} />}
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
          onOpenPlayerMenu={onOpenPlayerMenu}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={TEAM1_STYLES}
          lockRow={lockRow}
          courtNumber={court.courtNumber}
          showGender={showGender}
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
          onOpenPlayerMenu={onOpenPlayerMenu}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={TEAM2_STYLES}
          lockRow={lockRow}
          courtNumber={court.courtNumber}
          showGender={showGender}
        />
      </div>
    </div>
  );
}
