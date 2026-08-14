import type { Round, Player, LockedPair } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { CourtMatchup } from './CourtMatchup';
import { SitOutList } from './SitOutList';
import { ROUND_TYPE_META, courtMatchesType, roundTypeOf } from '../../lib/roundTypes';
import { ROUND_EDGE, ROUND_FILL, ROUND_HEADING_TEXT } from './roundLook';

interface Props {
  round: Round;
  roundIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  allPlayers: Player[];
  locks: LockedPair[];
  onToggleLock: (roundIdx: number, courtIdx: number, team: 'team1' | 'team2') => void;
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
   * Whether this is the round the first-run tour points at, which is Round 1.
   * All it does is let the first two courts name themselves for the tour's
   * anchors — every round draws the same, and nothing here reads it otherwise.
   */
  tourRound?: boolean;
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
  onOpenPlayerMenu,
  isComplete,
  isExpanded,
  canUncomplete,
  onToggleComplete,
  onToggleExpand,
  onEditCourtNumber,
  scoringEnabled,
  onEditScore,
  tourRound,
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

  return (
    <div
      className="round-card rounded-lg shadow border-2 px-[0.6rem] pt-[0.83rem] pb-[1.2rem]"
      style={{ backgroundColor: ROUND_FILL, borderColor: ROUND_EDGE }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
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
          data-tutorial={tourRound ? 'round-1-completed' : undefined}
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
              return (
                <CourtMatchup
                  // Keyed by position, not by number: two courts in a round may
                  // now carry the same one while the host is part way through
                  // renaming them.
                  key={courtIdx}
                  court={court}
                  roundIdx={roundIdx}
                  courtIdx={courtIdx}
                  tourCourt={tourRound ? courtIdx : undefined}
                  selectedSlot={selectedSlot}
                  onPlayerTap={onPlayerTap}
                  allPlayers={allPlayers}
                  lockedTeams={lockedTeams}
                  onToggleLock={onToggleLock}
                  onOpenPlayerMenu={onOpenPlayerMenu}
                  readOnly={isComplete}
                  offFormat={!!roundType && !courtMatchesType(court, roundType)}
                  showGender={showGender}
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
            onOpenPlayerMenu={onOpenPlayerMenu}
            allPlayers={allPlayers}
            readOnly={isComplete}
          />
        </>
      )}
    </div>
  );
}
