import type { Player, Partnership } from '../../types';
import { partnerPlayTeams } from '../../lib/partnerPlay';

/**
 * What tonight will be, once enough of the room is paired up to change it.
 *
 * Pairing the last couple turns the session into partner play: fixed teams that
 * meet each other rather than a round robin of individuals. That is a different
 * evening, and the host should be told at the moment it becomes true.
 *
 * It lives on the Setup page rather than inside the pairing list, because Done
 * Pairing is not a decision to un-know this. The list is a mode somebody steps
 * into and out of; the fact that tonight is partner play holds either way, and
 * the notice used to vanish under the one button most likely to be pressed
 * right after it appeared.
 *
 * `partnerPlayTeams` is the same call the scheduler makes, so this and the
 * schedule cannot disagree about whether tonight is partner play.
 */
export function PartnerPlayNotice({
  players,
  partnerships,
}: {
  /** The selected players only. */
  players: Player[];
  partnerships: Partnership[];
}) {
  const partnerPlay = partnerPlayTeams(players, partnerships);
  if (!partnerPlay) return null;

  // Partner play tolerates exactly one odd person out, and they play nothing.
  // That is worth more than a footnote, so it keeps its own warning.
  const spare = partnerPlay.spares[0];

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[#615fff] bg-[#eef2ff] px-3 py-2.5">
        <p className="text-lg font-bold text-[#312c85]">
          Partner play: {partnerPlay.teams.length} teams
        </p>
        <p className="mt-0.5 text-sm text-[#3730a3]">
          Partners stay together all session except for{' '}
          <strong className="font-bold">Special Game Type</strong> rounds like a{' '}
          <strong className="font-bold">Gendered</strong> round.
        </p>
      </div>

      {spare && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">{spare.name}</span> is not in a pair, so
          they will sit out every round. Pair them up, or take them out of the
          session.
        </p>
      )}
    </div>
  );
}
