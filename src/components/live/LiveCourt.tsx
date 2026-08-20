import type { CourtAssignment } from '../../types';
import { ScoreColon, ScorePanel } from '../schedule/Scoreboard';
import { toneFor } from '../schedule/scoreTone';
import {
  PLAYER_NAME_TEXT,
  ROUND_EDGE,
  ROUND_HEADING_TEXT,
  TEAM1_EDGE,
  TEAM2_EDGE,
} from '../schedule/roundLook';

interface Props {
  court: CourtAssignment;
  /** Whether this session keeps score at all. */
  showScore: boolean;
  /**
   * Opens the score for changing. Absent unless the host has switched editing
   * on, and then the board is a button rather than a reading. A watcher who
   * cannot change anything is not shown something that looks like they could.
   */
  onEditScore?: () => void;
}

/**
 * A court as somebody watching sees it.
 *
 * Not CourtMatchup. That card prints a rating on every chip and draws the
 * balance bar, and both of those are the host's own judgement of the people
 * playing — the published document does not carry either, so there would be
 * nothing to draw. It also takes eight props about tapping, locking, swapping
 * and removing, none of which a watcher can do.
 *
 * What it does share is the scoreboard and the look. The same ScorePanel and
 * the same tones, so a green side means the same thing on the host's phone and
 * on everybody else's, and the same `roundLook` sizes and edges, so a court is
 * the same panel on both pages. The one liberty is the board's place: with no
 * balance badge to hold the right-hand end of the header, the score takes it
 * rather than floating in the middle of nothing.
 */
export function LiveCourt({ court, showScore, onEditScore }: Props) {
  const scored = showScore && court.team1.length > 0 && court.team2.length > 0;

  const board = (
    <span className="flex shrink-0 items-center gap-[6px]">
      <ScorePanel value={court.score?.team1} tone={toneFor(court.score, 'team1')} size="sm" />
      <ScoreColon size="sm" />
      <ScorePanel value={court.score?.team2} tone={toneFor(court.score, 'team2')} size="sm" />
    </span>
  );

  return (
    <div className="rounded-lg border-2 bg-white p-3" style={{ borderColor: ROUND_EDGE }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className={`whitespace-nowrap font-bold text-gray-700 ${ROUND_HEADING_TEXT}`}>
          COURT {court.courtNumber}
        </h4>
        {scored &&
          (onEditScore ? (
            // The board itself is the target, at the size it already is. A
            // pencil beside it would be a second thing to aim at on the one
            // row of this card that is already full.
            <button
              type="button"
              onClick={onEditScore}
              aria-label={`Court ${court.courtNumber} score, ${
                court.score ? `${court.score.team1} to ${court.score.team2}` : 'not set'
              }. Change it.`}
              className="shrink-0 rounded-md transition-opacity hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              {board}
            </button>
          ) : (
            board
          ))}
      </div>

      <div className="flex items-stretch gap-1">
        <Side players={court.team1} tint={`bg-blue-50 ${TEAM1_EDGE}`} />
        <span className="self-center shrink-0 text-xs font-medium text-gray-400">Vs.</span>
        <Side players={court.team2} tint={`bg-orange-50 ${TEAM2_EDGE}`} />
      </div>
    </div>
  );
}

/** One team, in the colours and at the sizes the host's own card uses for it. */
function Side({ players, tint }: { players: CourtAssignment['team1']; tint: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {players.map((player) => (
        <div
          key={player.id}
          className={`flex min-w-0 flex-1 items-center rounded-md border px-1.5 py-2 ${tint}`}
        >
          {/* Wrapped, never cut, exactly as the host's card does it and for the
              same reason: the tail of a name is often the part that says which
              Vanessa this is. The seats stretch to a common height so a wrap on
              one side does not put the two sides out of step. */}
          <span
            className={`min-w-0 flex-1 hyphens-auto break-words font-medium ${PLAYER_NAME_TEXT}`}
            title={player.name}
          >
            {player.name}
          </span>
        </div>
      ))}
      {players.length === 0 && (
        <div className="min-w-0 flex-1 rounded-md border border-dashed border-gray-300 bg-gray-50 px-1.5 py-2 text-sm font-medium text-gray-400">
          EMPTY
        </div>
      )}
    </div>
  );
}
