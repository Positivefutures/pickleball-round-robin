import type { Round, Player, LockedPair } from '../../types';
import type { CourtSlot, PlayerSlot } from './SchedulePage';
import { CourtMatchup } from './CourtMatchup';
import { SitOutList } from './SitOutList';
import { ROUND_TYPE_META, courtMissReason, roundTypeOf } from '../../lib/roundTypes';
import { ROUND_EDGE, ROUND_FILL, ROUND_HEADING_TEXT } from './roundLook';
import { ChevronDownIcon } from '../icons';

interface Props {
  round: Round;
  roundIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  allPlayers: Player[];
  locks: LockedPair[];
  onToggleLock: (roundIdx: number, courtIdx: number, team: 'team1' | 'team2') => void;
  /** The one locked seat showing its pencil. See CourtMatchup. */
  pencilSlot: CourtSlot | null;
  onLockedTap: (slot: CourtSlot) => void;
  onOpenPlayerMenu: (player: Player) => void;
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
  /**
   * Scrolls the page down to the standings. Absent when there are none, which
   * is any session that does not keep score.
   */
  onViewStandings?: () => void;
  /**
   * Whether this is the round the first-run tour points at, which is Round 1.
   * All it does is let the first two courts name themselves for the tour's
   * anchors — every round draws the same, and nothing here reads it otherwise.
   */
  tourRound?: boolean;
  /**
   * Hides the pencil on a selected seat while the tour is up. The card that
   * teaches swapping leaves the seats live, and the pencil sitting inside the
   * one they have just tapped is a second thing to press on a card whose whole
   * instruction is to press one more player.
   */
  hideSeatEdit?: boolean;
  /**
   * The players who have just changed places in this round, if any. Their seats
   * take a strong edge and fade it back over two seconds. Absent on every round
   * but the one the swap was made in.
   */
  swappedIds?: string[];
  /** Which swap those ids belong to. See SwapFlash in SchedulePage. */
  swapSeq?: number;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`w-[21px] h-[21px] transition-transform ${expanded ? 'rotate-180' : ''}`}
    >
      <path d="M12 15.5l-6-6L7.4 8l4.6 4.6L16.6 8 18 9.5z" />
    </svg>
  );
}

/**
 * One round: its courts, whoever is sitting out, and the tick that closes it.
 *
 * The card takes its fill and its edge from `roundLook`. It used to be white,
 * and a completed one grey; both are the one fill now, so a round reads as a
 * single block on the page and the courts on it as the white things to look at.
 * Everything printed straight onto the fill is white, which is why the completed
 * state signals itself with the tick and the collapsed body rather than by going
 * pale.
 *
 * Nothing here reaches paper: the whole on-screen schedule is `no-print` and the
 * printed sheet is its own component.
 */
export function RoundCard({
  round,
  roundIdx,
  selectedSlot,
  onPlayerTap,
  allPlayers,
  locks,
  onToggleLock,
  pencilSlot,
  onLockedTap,
  onOpenPlayerMenu,
  isComplete,
  isExpanded,
  canUncomplete,
  onToggleComplete,
  onToggleExpand,
  onEditCourtNumber,
  scoringEnabled,
  onEditScore,
  onViewStandings,
  tourRound,
  hideSeatEdit,
  swappedIds,
  swapSeq,
}: Props) {
  // A completed round collapses by default and can only be viewed, not edited.
  const showBody = !isComplete || isExpanded;
  const roundType = roundTypeOf(round);
  // Both formats are made of who is a man and who is a woman, so both are worth
  // marking. Equal Skill is not, and an ordinary round has no format at all.
  //
  // Courts only. The question a mark answers is whether the four people on this
  // court are the four the format asked for, and nobody sitting out is on one.
  const showGender = roundType === 'gendered' || roundType === 'mixed';
  const typeBadge = roundType && (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded ${ROUND_TYPE_META[roundType].badgeClass}`}
    >
      {ROUND_TYPE_META[roundType].badge}
    </span>
  );

  /**
   * The way down to the table this round feeds. A long session is several
   * screens of rounds and the standings are under all of them.
   *
   * Only on a round showing its courts. A completed one collapses to a single
   * bar, and hanging a link off each of those would double the height of the
   * stack at the top of the page, for a link that is a scroll away from there
   * anyway.
   *
   * Built here rather than inline because it has two homes: the far end of the
   * SITTING OUT line, and its own row on a round where nobody is sitting out.
   */
  const standingsLink =
    showBody && onViewStandings ? (
      <button
        type="button"
        onClick={onViewStandings}
        // Set against SITTING OUT beside it: both 1rem, and both bold, which is
        // what lets them share a line without one shouting over the other.
        className="no-print flex shrink-0 items-center gap-1 text-base font-bold text-white underline decoration-white/50 underline-offset-2 transition-colors hover:text-white/75"
      >
        View Standings
        <ChevronDownIcon className="h-4 w-4" />
      </button>
    ) : null;

  return (
    <div
      className="round-card rounded-lg shadow border-2 px-[0.6rem] pt-[0.83rem] pb-[1.2rem]"
      style={{ backgroundColor: ROUND_FILL, borderColor: ROUND_EDGE }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            {/* Just the number. The heading used to carry "(completed)" beside
                it, which said a third time what the ticked COMPLETED box and
                the View/Hide button already say. Jeff's call on 2026-08-15. */}
            <h3 className={`${ROUND_HEADING_TEXT} font-extrabold uppercase text-white`}>
              Round {round.roundNumber}
            </h3>
            {/* A completed round also carries View/Hide, which leaves no room
                for the badge alongside — it drops to its own line instead. */}
            {!isComplete && typeBadge}
            {isComplete && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="flex items-center gap-1 text-base text-white hover:text-white/75 transition-colors no-print"
                aria-expanded={isExpanded}
              >
                {isExpanded ? 'Hide' : 'View'}
                <ChevronIcon expanded={isExpanded} />
              </button>
            )}
          </div>
          {isComplete && typeBadge && <div className="mt-1">{typeBadge}</div>}
        </div>

        {/* Locked reads as a paler white rather than a grey, which would be the
            one dark thing on the card and look like a mistake. The tooltip is
            what actually says why it will not move. */}
        <label
          className={`flex items-center gap-2 ${ROUND_HEADING_TEXT} font-bold select-none no-print ${
            isComplete && !canUncomplete
              ? 'text-white/70 cursor-default'
              : 'text-white cursor-pointer'
          }`}
          title={
            isComplete && !canUncomplete
              ? 'Completed rounds are locked once a player has been removed'
              : undefined
          }
        >
          COMPLETED
          {/* Filled in the round's own edge colour rather than the app's green,
              which would be a second accent fighting the card behind it. */}
          <input
            type="checkbox"
            checked={isComplete}
            disabled={isComplete && !canUncomplete}
            onChange={onToggleComplete}
            style={{ accentColor: ROUND_EDGE }}
            className="w-5 h-5 disabled:cursor-default"
          />
        </label>
      </div>

      {showBody && (
        <>
          {/* The line changes with scoring on, because the plain one would be a
              lie: the players are fixed but the board is still live. */}
          {isComplete && (
            <p className="text-base text-white italic mt-3 no-print">
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
              // Why this court is not playing the round's format, when it is
              // not. On the card rather than inside the court panel, which is
              // where the score lives and has no room for a sentence.
              const missReason = roundType && courtMissReason(round, roundType, court);
              return (
                // Keyed by position, not by number: two courts in a round may
                // now carry the same one while the host is part way through
                // renaming them.
                <div key={courtIdx}>
                  <CourtMatchup
                    court={court}
                    roundIdx={roundIdx}
                    courtIdx={courtIdx}
                    tourCourt={tourRound ? courtIdx : undefined}
                    hideSeatEdit={hideSeatEdit}
                    swappedIds={swappedIds}
                    swapSeq={swapSeq}
                    selectedSlot={selectedSlot}
                    pencilSlot={pencilSlot}
                    onPlayerTap={onPlayerTap}
                    onLockedTap={onLockedTap}
                    allPlayers={allPlayers}
                    lockedTeams={lockedTeams}
                    onToggleLock={onToggleLock}
                    onOpenPlayerMenu={onOpenPlayerMenu}
                    readOnly={isComplete}
                    showGender={showGender}
                    onEditNumber={() => onEditCourtNumber(courtIdx)}
                    showScore={scoringEnabled}
                    onEditScore={() => onEditScore(courtIdx)}
                  />
                  {/* Under the court it is about, so the eye reaches the names
                      first and the explanation second. */}
                  {missReason && (
                    <p className="mt-1.5 text-sm font-medium text-white no-print">{missReason}</p>
                  )}
                </div>
              );
            })}
          </div>
          <SitOutList
            players={round.sitOuts}
            roundIdx={roundIdx}
            swappedIds={swappedIds}
            swapSeq={swapSeq}
            selectedSlot={selectedSlot}
            onPlayerTap={onPlayerTap}
            onOpenPlayerMenu={onOpenPlayerMenu}
            allPlayers={allPlayers}
            readOnly={isComplete}
            action={standingsLink}
          />
          {/* Nobody sitting out, so there is no line for it to share. It keeps
              the place it has always had. */}
          {round.sitOuts.length === 0 && standingsLink && (
            <div className="mt-3 flex justify-end">{standingsLink}</div>
          )}
        </>
      )}
    </div>
  );
}
