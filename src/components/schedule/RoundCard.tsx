import type { Round, Player, LockedPair } from '../../types';
import type { CourtSlot, PlayerSlot } from './SchedulePage';
import { CourtMatchup } from './CourtMatchup';
import { SitOutList } from './SitOutList';
import { courtMissHeadline, courtMissReason, roundTypeOf } from '../../lib/roundTypes';
import { CourtMissNote } from './CourtMissNote';
import {
  ROUND_EDGE, ROUND_EDGE_DONE, ROUND_FILL, ROUND_FILL_DONE, ROUND_HEADING_TEXT,
  ROUND_RULE_DONE, ROUND_RULE_LIVE, ROUND_TEXT_DONE,
} from './roundLook';
import { ChevronDownIcon } from '../icons';
import { RoundTimerChip } from './RoundTimerChip';
import { RoundTypeBadge } from './RoundTypeBadge';

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
  /** Opens the Round Timer panel for this round. */
  onOpenTimer: () => void;
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
 * and a completed one grey; both became the one fill, so a round reads as a
 * single block on the page and the courts on it as the white things to look at.
 *
 * A finished round goes pale again as of 2026-08-20, which is a reversal of the
 * line that used to be here. The reason the old one gave — everything printed
 * on the fill is white, so a paler fill would lose the writing — was right about
 * the mechanism and wrong about the conclusion: the answer is to take the
 * writing off white too. Stacked at the top of a long session, a dozen finished
 * rounds in the live colour meant the round actually being played was found by
 * reading numbers rather than by looking. Now the live ones are the only loud
 * things on the page. See ROUND_FILL_DONE.
 *
 * Two different states drive it, and they are deliberately not the same one.
 * The wash follows **done**, because that is the thing it is saying, so a
 * finished round opened with View stays pale while it is read. The saved height
 * follows **collapsed**, because that is the only state with a height to save —
 * an open card's height is its courts.
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
  onOpenTimer,
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
  // Nothing but the header bar on screen, which is what there is room to shorten.
  const collapsed = !showBody;

  // The palette this card is drawn in. One object rather than a conditional at
  // each of the six places that need it, so a card cannot end up half washed.
  const look = isComplete
    ? { fill: ROUND_FILL_DONE, edge: ROUND_EDGE_DONE, text: ROUND_TEXT_DONE, rule: ROUND_RULE_DONE }
    : { fill: ROUND_FILL, edge: ROUND_EDGE, text: 'text-white', rule: ROUND_RULE_LIVE };
  const roundType = roundTypeOf(round);
  // Both formats are made of who is a man and who is a woman, so both are worth
  // marking. Equal Skill is not, and an ordinary round has no format at all.
  //
  // Courts only. The question a mark answers is whether the four people on this
  // court are the four the format asked for, and nobody sitting out is on one.
  const showGender = roundType === 'gendered' || roundType === 'mixed';

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
        className={`no-print flex shrink-0 items-center gap-1 text-base font-bold underline underline-offset-2 transition-opacity hover:opacity-75 ${look.text} ${look.rule}`}
      >
        View Standings
        <ChevronDownIcon className="h-4 w-4" />
      </button>
    ) : null;

  return (
    <>
      {/* Sitting on the card rather than inside it. See RoundTypeBadge. */}
      {roundType && <RoundTypeBadge type={roundType} />}

      <div
        // Collapsed, the padding comes in and the line box tightens: 13.28/19.2
        // and a 1.5 line box measured 68.8px on a 390px screen, and 10/10 with
        // a tight one measures about 51, which is the quarter off Jeff asked
        // for on 2026-08-20. Neither number is guessed — see the note on
        // `collapsed` above and the measurement in the commit.
        className={`round-card rounded-lg shadow border-2 px-1.5 ${
          collapsed ? 'py-2.5' : 'pt-[0.83rem] pb-[1.2rem]'
        }`}
        style={{ backgroundColor: look.fill, borderColor: look.edge }}
      >
        <div
          className={`flex items-center justify-between gap-3 flex-wrap ${
            collapsed ? 'leading-tight' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            {/* Just the number. The heading used to carry "(completed)" beside
                it, which said a third time what the ticked DONE box and
                the View/Hide button already say. Jeff's call on 2026-08-15. */}
            {/* Bold rather than extra-bold once it is finished. Jeff asked for
                less bold as well as less dark, and the weight is the half of
                that which survives being read at arm's length. */}
            <h3
              className={`${ROUND_HEADING_TEXT} ${
                isComplete ? 'font-bold' : 'font-extrabold'
              } uppercase ${look.text}`}
            >
              Round {round.roundNumber}
            </h3>
            {isComplete && (
              <button
                type="button"
                onClick={onToggleExpand}
                className={`flex items-center gap-1 text-base ${look.text} transition-colors hover:opacity-75 no-print`}
                aria-expanded={isExpanded}
              >
                {isExpanded ? 'Hide' : 'View'}
                <ChevronIcon expanded={isExpanded} />
              </button>
            )}
          </div>

          {/* Grouped with DONE so the outer row still resolves to two flex
              items, the same two it has always had — the timer button is not a
              third thing for justify-between to place. */}
          <div className="flex items-center gap-3">
            {/* Gone once the round is DONE: a finished round has nothing left
                to time, and checking DONE while this timer is running stops it
                — see stopAndResetIfRound in lib/roundTimer.ts. */}
            {!isComplete && (
              <RoundTimerChip roundNumber={round.roundNumber} onOpen={onOpenTimer} />
            )}

            {/* Locked reads as a paler white rather than a grey, which would be
                the one dark thing on the card and look like a mistake. The
                tooltip is what actually says why it will not move. */}
            <label
              className={`flex items-center gap-2 ${ROUND_HEADING_TEXT} font-bold select-none no-print ${look.text} ${
                isComplete && !canUncomplete ? 'opacity-70 cursor-default' : 'cursor-pointer'
              }`}
              title={
                isComplete && !canUncomplete
                  ? 'Completed rounds are locked once a player has been removed'
                  : undefined
              }
            >
              DONE
              {/* Filled in the round's own edge colour rather than the app's
                  green, which would be a second accent fighting the card
                  behind it. */}
              <input
                type="checkbox"
                checked={isComplete}
                disabled={isComplete && !canUncomplete}
                onChange={onToggleComplete}
                style={{ accentColor: look.edge }}
                className="w-5 h-5 disabled:cursor-default"
              />
            </label>
          </div>
        </div>

        {showBody && (
          <>
            {/* The line changes with scoring on, because the plain one would be a
                lie: the players are fixed but the board is still live. */}
            {isComplete && (
              <p className={`text-base ${look.text} italic mt-3 no-print`}>
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
                    {missReason && roundType && (
                      <CourtMissNote
                        headline={courtMissHeadline(
                          roundType,
                          courtIdx === round.courts.length - 1
                        )}
                        reason={missReason}
                      />
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
    </>
  );
}
