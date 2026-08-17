import { StepPlayersIcon } from '../icons';
import { STEPPER_INK } from '../stepperLook';

/**
 * How many of the session's places are taken, and who that leaves sitting.
 *
 * It was drawn on the Setup Round Robin panel, under the two steppers that
 * decide the number it is reporting. It sits over the player list instead now:
 * the count only ever changes by somebody being ticked or unticked, so it
 * belongs beside the ticking rather than a panel away from it.
 *
 * `numPlayers` is everybody selected, paired players included — the grid under
 * this line leaves pairs out, and a count that dropped by two when two people
 * were linked would be reporting on the wrong thing.
 */
interface Props {
  numPlayers: number;
  numCourts: number;
}

export function SpotsFilled({ numPlayers, numCourts }: Props) {
  const spotsNeeded = numCourts * 4;
  const sitOutsPerRound = Math.max(0, numPlayers - spotsNeeded);

  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-teal">
        <StepPlayersIcon className="h-6 w-6 text-white" />
      </span>
      <div className="min-w-0">
        <p className="text-[1.2rem] font-bold" style={{ color: STEPPER_INK }}>
          {numPlayers} of {spotsNeeded} Spots Filled
        </p>
        {/* Red, not amber. Straight off the mockup, where it is the one warm
            thing on the panel and the only line that is a consequence rather
            than a setting. */}
        {sitOutsPerRound > 0 && (
          <p className="text-sm text-[#FD1F04]">
            {sitOutsPerRound} player{sitOutsPerRound > 1 ? 's' : ''} will sit out each round
          </p>
        )}
      </div>
    </div>
  );
}
