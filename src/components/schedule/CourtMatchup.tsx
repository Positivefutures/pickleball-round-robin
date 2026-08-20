import type { CourtAssignment, Player } from '../../types';
import type { CourtSlot, PlayerSlot } from './SchedulePage';
import { getDisplayName } from '../../utils/helpers';
import { BalanceIndicator } from './BalanceIndicator';
import { EditPlayerButton } from './EditPlayerButton';
import { GenderMark } from './GenderMark';
import { Scoreboard } from './Scoreboard';
import {
  PLAYER_NAME_TEXT,
  ROUND_EDGE,
  ROUND_HEADING_TEXT,
  TEAM1_EDGE,
  TEAM2_EDGE,
} from './roundLook';

interface Props {
  court: CourtAssignment;
  roundIdx: number;
  courtIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  /**
   * The one locked seat showing its pencil, if any. Locked seats are kept apart
   * from `selectedSlot` because a selection is an offer to swap and a locked
   * player has nobody to swap with — see SchedulePage.handleLockedTap.
   */
  pencilSlot: CourtSlot | null;
  onLockedTap: (slot: CourtSlot) => void;
  allPlayers: Player[];
  lockedTeams: { team1: boolean; team2: boolean };
  onToggleLock: (roundIdx: number, courtIdx: number, team: 'team1' | 'team2') => void;
  onOpenPlayerMenu: (player: Player) => void;
  readOnly?: boolean;
  /** Whether this round's format is built out of who is a man and who a woman. */
  showGender?: boolean;
  /** Hides the pencil on a selected seat. The tour's swap card sets it. */
  hideSeatEdit?: boolean;
  /** Players who have just changed places in this round. See RoundCard. */
  swappedIds?: string[];
  /** Which swap those ids belong to, so a second one restarts the fade. */
  swapSeq?: number;
  /** Opens the box for renaming this court. Absent on a round that cannot be edited. */
  onEditNumber?: () => void;
  /** Whether this session keeps score. Off, and the board is not drawn at all. */
  showScore?: boolean;
  /** Opens the box for writing the score down. */
  onEditScore?: () => void;
  /**
   * This court's index, but only on the round the first-run tour points at.
   * The first two courts name themselves for the tour's anchors; every other
   * court is handed undefined and draws exactly as it always did.
   */
  tourCourt?: number;
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
  /**
   * The edge a place wears for a moment after somebody has just been swapped
   * into it, before it fades back to `borderClass`. Each side's own colour
   * taken several steps down, so the mark reads as that place lighting up
   * rather than as a colour arriving from somewhere else.
   */
  swappedBorder: string;
  /**
   * And the fill under that edge for the same two seconds: `selectedBgClass`,
   * so the place a player lands in holds the colour it was wearing under your
   * finger a moment ago and then lets it go.
   *
   * Written as the theme variable the class compiles to rather than a hex.
   * Tailwind v4 keeps its palette in OKLCH, so blue-200's old hex is no longer
   * the colour on the screen, and a hex here would start the fade a shade off
   * the one the seat was actually wearing.
   */
  swappedBg: string;
}

function PlayerButton({
  player,
  playerIdx,
  teamKey,
  locked,
  roundIdx,
  courtIdx,
  selected,
  pencilOnly,
  onPlayerTap,
  onLockedTap,
  onOpenPlayerMenu,
  allPlayers,
  readOnly,
  styles,
  showGender,
  hideSeatEdit,
  swapped,
}: {
  player: Player;
  playerIdx: number;
  teamKey: 'team1' | 'team2';
  locked: boolean;
  roundIdx: number;
  courtIdx: number;
  selected: boolean;
  /** Locked, and tapped: show the pencil and nothing else. */
  pencilOnly: boolean;
  onPlayerTap: (slot: PlayerSlot) => void;
  onLockedTap: (slot: CourtSlot) => void;
  onOpenPlayerMenu: (player: Player) => void;
  allPlayers: Player[];
  readOnly: boolean;
  styles: TeamStyles;
  showGender: boolean;
  hideSeatEdit: boolean;
  /** Whether this place has just been swapped into. See index.css. */
  swapped: boolean;
}) {
  const { bgClass, borderClass, hoverClass, selectedBgClass, swappedBorder, swappedBg } = styles;
  /**
   * A locked seat is tappable, but not for swapping.
   *
   * It used to be dead: the only way to a locked player's pencil was to undo the
   * padlock first, tap them, and lock the pair again afterwards — three steps to
   * correct a spelling. Now a tap brings up the pencil on its own, and the seat
   * does not change colour, because a colour that says "selected" would be
   * offering a swap this player cannot make. A second tap puts it away.
   *
   * A completed round is still frozen entirely. Nothing on it can be changed,
   * and a pencil that led to a panel offering to would be a lie.
   */
  const showPencil = !readOnly && !hideSeatEdit && (locked ? pencilOnly : selected);
  const displayName = getDisplayName(player, allPlayers);
  const slot: CourtSlot = { kind: 'court', roundIdx, courtIdx, team: teamKey, playerIdx };

  return (
    <button
      type="button"
      onClick={() => {
        if (readOnly) return;
        if (locked) onLockedTap(slot);
        else onPlayerTap(slot);
      }}
      // The animation reads the two colours to start from off the element, so
      // this is the only thing either side has to say about it. A CSS animation
      // outranks the class the place is resting on and outranks an inline
      // colour too, which is what lets the fade end wherever the place would
      // have been anyway without either of them naming it.
      style={
        swapped
          ? ({
              '--seat-swapped-from': swappedBorder,
              '--seat-swapped-fill': swappedBg,
            } as React.CSSProperties)
          : undefined
      }
      className={`relative flex w-full min-w-0 flex-1 items-center justify-between rounded-md px-1.5 py-2 text-sm transition-colors ${
        swapped ? 'seat-swapped ' : ''
      }${
        locked
          ? `${bgClass} border-2 border-black`
          : selected
            ? `${selectedBgClass} border-blue-500 ring-2 ring-blue-500 border`
            : `${bgClass} ${borderClass} ${hoverClass} border`
      }${readOnly ? ' cursor-default' : ''}`}
    >
      {showGender && <GenderMark player={player} />}
      {/* Wrapped, never cut. Two players called Vanessa, told apart by a last
          initial, both came out as "Vanessa…" on a phone — the one character
          that identified them was the one the ellipsis took. A name goes to a
          second line instead, and the seats are stretched to a common height so
          that a court whose name wrapped still lines up with the one beside it,
          which is what the ellipsis was there to protect. */}
      <span
        className={`min-w-0 flex-1 hyphens-auto break-words text-left font-medium ${PLAYER_NAME_TEXT}`}
        title={displayName}
      >
        {displayName}
      </span>
      {showPencil ? (
        <EditPlayerButton player={player} onOpen={onOpenPlayerMenu} />
      ) : (
        <span className="shrink-0 pl-1 text-gray-500">{player.rating.toFixed(1)}</span>
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
    'w-full min-w-0 flex-1 text-sm px-1.5 py-2 rounded-md text-left font-medium border border-dashed transition-colors';
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
  pencilSlot,
  onPlayerTap,
  onLockedTap,
  onToggleLock,
  onOpenPlayerMenu,
  allPlayers,
  readOnly,
  styles,
  lockRow,
  courtNumber,
  showGender,
  hideSeatEdit,
  swappedIds,
  swapSeq,
}: {
  team: Player[];
  teamKey: 'team1' | 'team2';
  locked: boolean;
  roundIdx: number;
  courtIdx: number;
  selectedSlot: PlayerSlot | null;
  pencilSlot: CourtSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  onLockedTap: (slot: CourtSlot) => void;
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
  hideSeatEdit: boolean;
  swappedIds?: string[];
  swapSeq?: number;
}) {
  /**
   * The React key of a place, carrying which swap it is marked by.
   *
   * A key that changes remounts the button, and a remounted element runs its
   * animation from the start. That is the whole point: two swaps of the same
   * person inside two seconds would otherwise show one fade, half of it already
   * spent, and the second swap would look like it had not registered.
   */
  const seatKey = (player: Player) =>
    swappedIds?.includes(player.id) ? `${player.id}:${swapSeq}` : player.id;

  const isSwapped = (player: Player) => !!swappedIds?.includes(player.id);

  function isSelected(playerIdx: number) {
    return (
      selectedSlot?.kind === 'court' &&
      selectedSlot.roundIdx === roundIdx &&
      selectedSlot.courtIdx === courtIdx &&
      selectedSlot.team === teamKey &&
      selectedSlot.playerIdx === playerIdx
    );
  }

  function isPencil(playerIdx: number) {
    return (
      pencilSlot?.roundIdx === roundIdx &&
      pencilSlot.courtIdx === courtIdx &&
      pencilSlot.team === teamKey &&
      pencilSlot.playerIdx === playerIdx
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
    // wrapping. A grid item is min-width: auto until told otherwise.
    //
    // `subgrid` is what shares row heights with the other side. Its own rows
    // are the parent's, so seat one of each team is one row and seat two is
    // another, whatever either name did.
    <div
      className={`grid min-w-0 grid-rows-subgrid items-stretch ${
        lockRow ? 'row-span-3' : 'row-span-2'
      }`}
    >
      {team[0] && (
        <PlayerButton
          key={seatKey(team[0])}
          swapped={isSwapped(team[0])}
          player={team[0]}
          playerIdx={0}
          teamKey={teamKey}
          locked={locked}
          roundIdx={roundIdx}
          courtIdx={courtIdx}
          selected={isSelected(0)}
          pencilOnly={isPencil(0)}
          onPlayerTap={onPlayerTap}
          onLockedTap={onLockedTap}
          onOpenPlayerMenu={onOpenPlayerMenu}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={styles}
          showGender={showGender}
          hideSeatEdit={hideSeatEdit}
        />
      )}

      {lockRow &&
        (team.length === 2 ? (
          <button
            type="button"
            onClick={() => onToggleLock(roundIdx, courtIdx, teamKey)}
            className="justify-self-center -my-0.5 z-10 p-0.5 rounded hover:bg-gray-100 transition-colors"
            aria-label={locked ? 'Unlock pair' : 'Lock pair'}
          >
            <LockIcon locked={locked} />
          </button>
        ) : (
          <div aria-hidden="true" className="justify-self-center -my-0.5 p-0.5 w-4 h-4" />
        ))}

      {team[1] && (
        <PlayerButton
          key={seatKey(team[1])}
          swapped={isSwapped(team[1])}
          player={team[1]}
          playerIdx={1}
          teamKey={teamKey}
          locked={locked}
          roundIdx={roundIdx}
          courtIdx={courtIdx}
          selected={isSelected(1)}
          pencilOnly={isPencil(1)}
          onPlayerTap={onPlayerTap}
          onLockedTap={onLockedTap}
          onOpenPlayerMenu={onOpenPlayerMenu}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={styles}
          showGender={showGender}
          hideSeatEdit={hideSeatEdit}
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
  borderClass: TEAM1_EDGE,
  hoverClass: 'hover:bg-blue-100',
  selectedBgClass: 'bg-blue-200',
  swappedBorder: '#1d4ed8', // blue-700, against the darkened blue edge at rest
  swappedBg: 'var(--color-blue-200)', // what selectedBgClass compiles to
};

const TEAM2_STYLES: TeamStyles = {
  bgClass: 'bg-orange-50',
  borderClass: TEAM2_EDGE,
  hoverClass: 'hover:bg-orange-100',
  selectedBgClass: 'bg-orange-200',
  swappedBorder: '#c2410c', // orange-700, against the darkened orange edge at rest
  swappedBg: 'var(--color-orange-200)', // what selectedBgClass compiles to
};

export function CourtMatchup({ court, roundIdx, courtIdx, selectedSlot, pencilSlot, onPlayerTap, onLockedTap, allPlayers, lockedTeams, onToggleLock, onOpenPlayerMenu, readOnly = false, showGender = false, hideSeatEdit = false, swappedIds, swapSeq, onEditNumber, showScore = false, onEditScore, tourCourt }: Props) {
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
    // The same line as the card it sits on, so a court reads as a panel laid on
    // the round rather than as a box that happens to be near it.
    <div
      data-tutorial={tourCourt === 0 ? 'court-1' : tourCourt === 1 ? 'court-2' : undefined}
      className="border-2 rounded-lg p-3 bg-white"
      style={{ borderColor: ROUND_EDGE }}
    >
      {/* The heading and the balance badge each take half of what is left, so
          the board between them lands on the middle of the card and its colon
          sits directly over the Vs. below. Not justify-between: that centres the
          board between two things of different widths, which is not the middle
          of anything. */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Still a heading either way. On a round that can be edited it holds
              a button, because the number is the host's to set: a centre gives
              out courts 7, 8 and 9, and the app cannot know that. The dotted
              underline is the only hint that it opens something. */}
          {/* The tour's anchor is the heading, not the button inside it: a
              completed round has no button, and the tour still has to be able
              to point here. */}
          <h4
            data-tutorial={tourCourt === 0 ? 'court-1-label' : undefined}
            className={`whitespace-nowrap font-bold text-gray-700 ${ROUND_HEADING_TEXT}`}
          >
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
          {/* No "Normal game" mark here any more. The header row holds the
              court's name, the scoreboard and the balance badge, and on a phone
              there is not width for a fourth thing — the board sat over it. The
              printed sheet and the PDF still say it, where there is room and no
              board to say it under. */}
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
          <div className="no-print shrink-0">
            <Scoreboard
              score={court.score}
              courtNumber={court.courtNumber}
              onTap={onEditScore}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 justify-end">
          {showBalance && <BalanceIndicator ratingDiff={court.ratingDiff} />}
        </div>
      </div>

      {/* One grid for the whole court, and each side a subgrid of its rows.
          A name that wraps makes its row taller on both sides at once, so the
          two teams still read across — which is what the ellipsis was there to
          protect and the only thing lost by taking it away. */}
      <div
        className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1 ${
          lockRow ? 'grid-rows-[auto_auto_auto]' : 'grid-rows-[auto_auto]'
        }`}
      >
        <TeamColumn
          team={court.team1}
          teamKey="team1"
          locked={lockedTeams.team1}
          roundIdx={roundIdx}
          courtIdx={courtIdx}
          selectedSlot={selectedSlot}
          pencilSlot={pencilSlot}
          onPlayerTap={onPlayerTap}
          onLockedTap={onLockedTap}
          onToggleLock={onToggleLock}
          onOpenPlayerMenu={onOpenPlayerMenu}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={TEAM1_STYLES}
          lockRow={lockRow}
          courtNumber={court.courtNumber}
          showGender={showGender}
          hideSeatEdit={hideSeatEdit}
          swappedIds={swappedIds}
          swapSeq={swapSeq}
        />

        {/* Down the middle of both rows, centred on the court rather than on
            whichever side happened to be taller. */}
        <span
          className={`self-center shrink-0 text-xs font-medium text-gray-400 ${
            lockRow ? 'row-span-3' : 'row-span-2'
          }`}
        >
          Vs.
        </span>

        <TeamColumn
          team={court.team2}
          teamKey="team2"
          locked={lockedTeams.team2}
          roundIdx={roundIdx}
          courtIdx={courtIdx}
          selectedSlot={selectedSlot}
          pencilSlot={pencilSlot}
          onPlayerTap={onPlayerTap}
          onLockedTap={onLockedTap}
          onToggleLock={onToggleLock}
          onOpenPlayerMenu={onOpenPlayerMenu}
          allPlayers={allPlayers}
          readOnly={readOnly}
          styles={TEAM2_STYLES}
          lockRow={lockRow}
          courtNumber={court.courtNumber}
          showGender={showGender}
          hideSeatEdit={hideSeatEdit}
          swappedIds={swappedIds}
          swapSeq={swapSeq}
        />
      </div>
    </div>
  );
}
