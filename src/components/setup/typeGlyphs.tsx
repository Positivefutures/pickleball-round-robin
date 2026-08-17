import type { ReactElement } from 'react';
import type { RoundType } from '../../types';
import { EqualSkillIcon, MenGamesIcon, MixedGamesIcon, WomenGamesIcon } from '../icons';

/**
 * Jeff's artwork for the three game types, at the three sizes the app draws it.
 *
 * Gendered takes two symbols, because the format is men playing men and women
 * playing women and one symbol can only say half of that.
 *
 * The sizes within a row are not equal, and that is the point. The drawings do
 * not fill their boxes equally — the two gendered symbols reach the edges, the
 * mixed one fills about 77% of its height and the balance 96% — so at one box
 * size the mixed symbol reads as the small one. Each row puts the same amount
 * of ink on the page, which is what the eye is actually comparing. 'panel' is
 * the original 26/34/27 from the descriptions panel; the other two are that
 * ratio scaled.
 *
 * Three literal tables rather than one built by arithmetic, because Tailwind
 * only generates a utility it can see spelled out in a file.
 */

export type GlyphSize = 'panel' | 'picker' | 'badge';

type Glyph = { Icon: (p: { className?: string }) => ReactElement; size: string };

const PANEL: Record<RoundType, Glyph[]> = {
  gendered: [
    { Icon: MenGamesIcon, size: 'h-[26px] w-[26px]' },
    { Icon: WomenGamesIcon, size: 'h-[26px] w-[26px]' },
  ],
  mixed: [{ Icon: MixedGamesIcon, size: 'h-[34px] w-[34px]' }],
  skill: [{ Icon: EqualSkillIcon, size: 'h-[27px] w-[27px]' }],
};

const PICKER: Record<RoundType, Glyph[]> = {
  gendered: [
    { Icon: MenGamesIcon, size: 'h-[22px] w-[22px]' },
    { Icon: WomenGamesIcon, size: 'h-[22px] w-[22px]' },
  ],
  mixed: [{ Icon: MixedGamesIcon, size: 'h-[29px] w-[29px]' }],
  skill: [{ Icon: EqualSkillIcon, size: 'h-[23px] w-[23px]' }],
};

const BADGE: Record<RoundType, Glyph[]> = {
  gendered: [
    { Icon: MenGamesIcon, size: 'h-[18px] w-[18px]' },
    { Icon: WomenGamesIcon, size: 'h-[18px] w-[18px]' },
  ],
  mixed: [{ Icon: MixedGamesIcon, size: 'h-[23px] w-[23px]' }],
  skill: [{ Icon: EqualSkillIcon, size: 'h-[19px] w-[19px]' }],
};

const TABLES: Record<GlyphSize, Record<RoundType, Glyph[]>> = {
  panel: PANEL,
  picker: PICKER,
  badge: BADGE,
};

/**
 * The symbols for one type. A `null` type — an ordinary round robin — draws
 * nothing: there is no artwork for "no format", and a placeholder would be one
 * more thing to read on a row that is saying nothing happens here.
 */
export function TypeGlyphs({
  type,
  size,
  className = '',
}: {
  type: RoundType | null;
  size: GlyphSize;
  className?: string;
}) {
  if (!type) return null;
  return (
    <>
      {TABLES[size][type].map(({ Icon, size: box }, i) => (
        <Icon key={i} className={`${box} ${className}`} />
      ))}
    </>
  );
}
