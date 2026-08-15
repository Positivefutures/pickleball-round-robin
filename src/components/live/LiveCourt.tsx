import type { CourtAssignment } from '../../types';
import { ScoreColon, ScorePanel } from '../schedule/Scoreboard';
import { toneFor } from '../schedule/scoreTone';
import { PLAYER_NAME_TEXT, ROUND_EDGE, ROUND_HEADING_TEXT } from '../schedule/roundLook';

interface Props {
  court: CourtAssignment;
  /** Whether this session keeps score at all. */
  showScore: boolean;
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
export function LiveCourt({ court, showScore }: Props) {
  const scored = showScore && court.team1.length > 0 && court.team2.length > 0;

  return (
    <div className="rounded-lg border-2 bg-white p-4" style={{ borderColor: ROUND_EDGE }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className={`whitespace-nowrap font-bold text-gray-700 ${ROUND_HEADING_TEXT}`}>
          COURT {court.courtNumber}
        </h4>
        {scored && (
          <span className="flex shrink-0 items-center gap-[6px]">
            <ScorePanel value={court.score?.team1} tone={toneFor(court.score, 'team1')} size="sm" />
            <ScoreColon size="sm" />
            <ScorePanel value={court.score?.team2} tone={toneFor(court.score, 'team2')} size="sm" />
          </span>
        )}
      </div>

      <div className="flex items-start gap-2">
        <Side players={court.team1} tint="bg-blue-50 border-blue-200" />
        <span className="self-center shrink-0 text-xs font-medium text-gray-400">Vs.</span>
        <Side players={court.team2} tint="bg-orange-50 border-orange-200" />
      </div>
    </div>
  );
}

/** One team, in the colours and at the sizes the host's own card uses for it. */
function Side({ players, tint }: { players: CourtAssignment['team1']; tint: string }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      {players.map((player) => (
        <div
          key={player.id}
          className={`flex items-center rounded-md border px-3 py-2 ${tint}`}
        >
          {/* One line and an ellipsis, so a long name cannot make this court
              taller than the one beside it. The title carries the whole of it. */}
          <span
            className={`min-w-0 flex-1 truncate font-medium ${PLAYER_NAME_TEXT}`}
            title={player.name}
          >
            {player.name}
          </span>
        </div>
      ))}
      {players.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-400">
          EMPTY
        </div>
      )}
    </div>
  );
}
