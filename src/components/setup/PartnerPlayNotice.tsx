import type { Player, Partnership } from '../../types';
import { partnerPlayTeams } from '../../lib/partnerPlay';
import { PanelBadge } from '../PanelGlyph';
import { StepPlayersIcon } from '../icons';

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
    /* mt-1.5 because the ring hangs 26px above the box and the gap the page
       leaves above it is 24. Two pixels of overlap is all it would be, and it
       would land on the Generate button. */
    <div className="mt-1.5 space-y-4">
      {/* pt-7 is the badged cards' figure: 26px of ring inside the box, plus
          two so the heading is not touching it. */}
      <div className="relative rounded-md border border-[#615fff] bg-[#eef2ff] px-3 pt-7 pb-2.5">
        {/* The Players tab's own shape. Who is in the room is what decides
            this, and the ring takes the panel's edge rather than the grey the
            white cards use. */}
        <PanelBadge
          icon={StepPlayersIcon}
          edgeClassName="border-[#615fff]"
          inkClassName="text-[#3730a3]"
        />
        <p className="text-lg font-bold text-[#312c85]">
          Partner Play Mode: {partnerPlay.teams.length} teams
        </p>
        <p className="mt-0.5 text-sm text-[#3730a3]">
          {/* "Special Round Type rounds" would say round twice in four words,
              so the noun after it goes. */}
          Partners stay together all session except for a{' '}
          <strong className="font-bold">Special Round Type</strong> like a{' '}
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
