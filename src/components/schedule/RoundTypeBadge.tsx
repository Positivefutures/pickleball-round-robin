import type { ReactElement } from 'react';
import type { RoundType } from '../../types';
import { ROUND_TYPE_META } from '../../lib/roundTypes';
import {
  EqualSkillIcon,
  MenGamesIcon,
  MixedGamesIcon,
  WomenGamesIcon,
} from '../icons';

/**
 * What format a round is played in, on a tab sitting astride the top edge of
 * the card it belongs to.
 *
 * It used to be a chip inline beside the round number, where it was one more
 * thing on an already busy line and a completed round had to drop it to a line
 * of its own for want of room. Up here it is centred over the card, reads as a
 * label on the thing rather than a note inside it, and both states draw the
 * same. Jeff's call on 2026-08-16.
 *
 * A round with no format has no tab at all, which is most of them.
 */

/**
 * The same artwork the Round Types panel uses, at a size that sits with
 * small text instead of a heading.
 *
 * Gendered takes two, because the format is men playing men and women playing
 * women and one symbol can only say half of that.
 *
 * The three sizes are the panel's own 26/34/27, scaled together: the drawings
 * do not fill their boxes equally, and at one box size the mixed symbol reads
 * as the small one. Spelled out rather than worked out, because Tailwind only
 * generates a utility it can see written in a file.
 */
const TYPE_GLYPHS: Record<
  RoundType,
  { Icon: (p: { className?: string }) => ReactElement; size: string }[]
> = {
  gendered: [
    { Icon: MenGamesIcon, size: 'h-[18px] w-[18px]' },
    { Icon: WomenGamesIcon, size: 'h-[18px] w-[18px]' },
  ],
  mixed: [{ Icon: MixedGamesIcon, size: 'h-[23px] w-[23px]' }],
  skill: [{ Icon: EqualSkillIcon, size: 'h-[19px] w-[19px]' }],
};

export function RoundTypeBadge({ type }: { type: RoundType }) {
  const meta = ROUND_TYPE_META[type];

  return (
    <div className="no-print flex justify-center">
      {/* No bottom line and no bottom corners: the card's own top edge closes
          the tab, so the two meet as one shape rather than as two lines
          stacked. The rest of the edge is the fill several steps darker. */}
      <span
        className={`flex items-center gap-1.5 rounded-t-lg border-2 border-b-0 px-3 py-1 text-sm font-bold ${meta.badgeClass} ${meta.badgeEdgeClass}`}
      >
        {TYPE_GLYPHS[type].map(({ Icon, size }, i) => (
          <Icon key={i} className={size} />
        ))}
        {meta.badge}
      </span>
    </div>
  );
}
