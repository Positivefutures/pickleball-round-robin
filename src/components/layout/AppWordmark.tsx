/**
 * The app's name as it is drawn: the coined word over the plain words.
 *
 * Two lines, because the name alone says nothing to somebody who has never seen
 * it and the words alone are what every competitor is called. Orange leads, so
 * the eye lands on the part that is ours; the description under it is set in the
 * app's near-black at three quarters the size and reads as the caption it is.
 *
 * One component and not a pair of spans at each site, because the two lines have
 * a fixed relationship — colour, size, weight, and the tight leading that keeps
 * them reading as one mark rather than a heading and a subheading.
 *
 * The heading level is the caller's: the banner's is the page's `h1`, the
 * settings drawer's is an `h2` inside it.
 */

import { APP_NAME, APP_SUBTITLE } from '../../lib/appInfo';

/** The app's near-black. The same value the banner's type has always been. */
const INK = '#051829';

interface AppWordmarkProps {
  /**
   * Font size of the name. The description is set at a share of it rather than
   * separately, so the mark cannot come apart at some width nobody tested.
   *
   * Jeff's sizes are 26px over 20px. Both are given here as the top of a clamp:
   * the banner is 110px tall on a phone with a robin on its left and a court on
   * its right, and 26/20 in what is left over would wrap on anything narrower
   * than a large phone. See the caller for the width it actually gets.
   */
  size: string;
  /**
   * Colour of the description. Black by default, and given only where the mark
   * sits on something dark — the settings drawer, which is navy.
   */
  subtitleColor?: string;
  className?: string;
}

/** The description, as a share of the name. 20/26, Jeff's two sizes. */
const SUBTITLE_RATIO = 20 / 26;

export function AppWordmark({ size, subtitleColor = INK, className = '' }: AppWordmarkProps) {
  return (
    <span className={`block min-w-0 ${className}`}>
      <span
        className="block font-bold leading-[1.1] tracking-tight text-brand-orange"
        style={{ fontSize: size }}
      >
        {APP_NAME}
      </span>
      {/* Semibold, not bold: at three quarters the size a second bold line
          competes with the name instead of sitting under it. The small top
          margin closes the gap the two line boxes leave between them, so the
          pair sits as one block. */}
      <span
        className="mt-[0.08em] block font-semibold leading-[1.15] tracking-tight"
        style={{ fontSize: `calc(${size} * ${SUBTITLE_RATIO})`, color: subtitleColor }}
      >
        {APP_SUBTITLE}
      </span>
    </span>
  );
}
