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
 * **Courts only, not the players sitting out.** The question is whether the four
 * on this court are the four the format asked for. Nobody on the bench is on a
 * court, so a mark there answers nothing and only crowds the row.
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
 * Not on the middle of the edge any more. It hangs off the seat's top-left
 * corner, which is where a badge belongs on a card and where it is furthest from
 * a name that has wrapped onto a second line. 25px rather than 17.5, because up
 * there it is no longer competing with the first letter for the same inch, and
 * the mark is only useful if it can be read at a glance.
 *
 * **The two are placed separately, and that is not an oversight.** Both glyphs
 * are drawn in the same 25px box and neither fills it the same way: the man is a
 * circle with an arrow off its top-right, the woman a circle with a cross hung
 * below it. One offset for both put the two visibly out of line, so each has its
 * own, set by eye against the real glyphs on a real court. They land a couple of
 * pixels apart in each direction, which is small enough to read as a rounding
 * error and is not one: it is where the two circles sit level. They line up the *ink*,
 * which is the only thing anybody at a court can see — so do not tidy these into
 * one number.
 *
 * Screen only. The printed sheet is read out at the net, where the round's own
 * heading has already said what format is being played.
 *
 * Switchable off entirely from Settings. See stores.showGenderMarks; RoundCard
 * is what reads it.
 */
export function GenderMark({ player }: { player: Player }) {
  const woman = player.gender === 'F';
  const Icon = woman ? FemaleIcon : MaleIcon;
  return (
    <span
      className={`no-print absolute left-0 top-1/2 flex -translate-x-1/2 -translate-y-1/2 text-gray-500 ${
        woman ? '-mt-[18px] ml-0' : '-mt-[22px] ml-0.5'
      }`}
      title={woman ? `${player.name} is a woman` : `${player.name} is a man`}
    >
      <Icon className="h-[25px] w-[25px]" />
    </span>
  );
}
