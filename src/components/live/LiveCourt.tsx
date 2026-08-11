import type { CourtAssignment } from '../../types';
import { ScoreColon, ScorePanel } from '../schedule/Scoreboard';
import { toneFor } from '../schedule/scoreTone';
import { GuestChip } from '../schedule/GuestChip';

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
 * What it does share is the scoreboard. The same ScorePanel and the same tones,
 * so a green side means the same thing on the host's phone and on everybody
 * else's, and the two can never drift apart.
 */
export function LiveCourt({ court, showScore }: Props) {
  const scored = showScore && court.team1.length > 0 && court.team2.length > 0;

  return (
    <div className="rounded-lg border border-[#ddd] bg-white px-3 py-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="font-bold text-gray-700">COURT {court.courtNumber}</h4>
        {scored && (
          <span className="flex shrink-0 items-center gap-[5px]">
            <ScorePanel value={court.score?.team1} tone={toneFor(court.score, 'team1')} size="sm" />
            <ScoreColon size="sm" />
            <ScorePanel value={court.score?.team2} tone={toneFor(court.score, 'team2')} size="sm" />
          </span>
        )}
      </div>

      <div className="flex items-start gap-2">
        <Side players={court.team1} tint="bg-blue-50" />
        <span className="self-center text-xs font-bold text-gray-400">vs</span>
        <Side players={court.team2} tint="bg-orange-50" />
      </div>
    </div>
  );
}

/** One team, in the colours the host's own card uses for it. */
function Side({ players, tint }: { players: CourtAssignment['team1']; tint: string }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      {players.map((player) => (
        <div
          key={player.id}
          className={`flex items-center gap-1 rounded border border-[#e2e2e2] px-2 py-1.5 text-sm ${tint}`}
        >
          {/* One line and an ellipsis, so a long name cannot make this court
              taller than the one beside it. The title carries the whole of it. */}
          <span className="min-w-0 flex-1 truncate font-medium" title={player.name}>
            {player.name}
          </span>
          <GuestChip player={player} />
        </div>
      ))}
      {players.length === 0 && (
        <div className="rounded border border-dashed border-[#d4d4d4] px-2 py-1.5 text-sm text-gray-400">
          Empty
        </div>
      )}
    </div>
  );
}
