import type { Player } from '../../types';
import { FemaleIcon, MaleIcon } from '../icons';

/**
 * Marks a player as a man or a woman, on the rounds where that is what the
 * format is made of.
 *
 * Only drawn on a Gendered or a Mixed round, because that is the only time the
 * question is being asked. On an ordinary round it would be a mark on every
 * name meaning nothing, and the roster table is where somebody's gender is
 * looked up rather than glanced at.
 *
 * Grey rather than blue and pink. It sits inside a coloured place on a court
 * that already carries a guest chip and a rating, and a third colour on that row
 * would be read as a third thing to act on.
 *
 * Screen only. The printed sheet is read out at the net, where the round's own
 * heading has already said what format is being played.
 */
export function GenderMark({ player }: { player: Player }) {
  const Icon = player.gender === 'F' ? FemaleIcon : MaleIcon;
  return (
    <span
      className="no-print flex shrink-0 text-gray-500"
      title={player.gender === 'F' ? `${player.name} is a woman` : `${player.name} is a man`}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}
