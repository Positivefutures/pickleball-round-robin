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
 * **It costs the name no room.** The mark is taken out of the flow and hung on
 * the left edge of the place it belongs to, centred over the border so half of
 * it is inside and half out. A name on a phone has barely enough width as it is,
 * and a mark in the row would have shortened every one of them on the two
 * formats that need it most. The caller supplies the `relative`; the box's own
 * px-3 leaves the inner half clear of the first letter.
 *
 * Screen only. The printed sheet is read out at the net, where the round's own
 * heading has already said what format is being played.
 */
export function GenderMark({ player }: { player: Player }) {
  const Icon = player.gender === 'F' ? FemaleIcon : MaleIcon;
  return (
    <span
      className="no-print absolute left-0 top-1/2 flex -translate-x-1/2 -translate-y-1/2 text-gray-500"
      title={player.gender === 'F' ? `${player.name} is a woman` : `${player.name} is a man`}
    >
      <Icon className="h-[17.5px] w-[17.5px]" />
    </span>
  );
}
