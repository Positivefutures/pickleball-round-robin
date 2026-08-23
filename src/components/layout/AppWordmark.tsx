/**
 * The app's name as it is drawn: the sport, then the coined word, then the plain
 * words.
 *
 * Three lines, because no one of them does the job. The name alone says nothing
 * to somebody who has never seen it, the plain words are what every competitor
 * is called, and neither says what sport this is. So the sport states it in
 * black caps, the orange takes the eye to the part that is ours, and the
 * description under it reads as the caption it is.
 *
 * One component and not three spans at each site, because the lines have a fixed
 * relationship — colour, size, weight, and the tight leading that keeps them
 * reading as one mark rather than a stack of headings.
 *
 * The heading level is the caller's: the banner's is the page's `h1`, the
 * settings drawer's is an `h2` inside it.
 */

import { APP_NAME, APP_SPORT, APP_SUBTITLE } from '../../lib/appInfo';

/** The app's near-black. The same value the banner's type has always been. */
const INK = '#051829';

interface AppWordmarkProps {
  /**
   * Font size of the name. The description is set at a share of it rather than
   * separately, so the mark cannot come apart at some width nobody tested.
   *
   * Jeff's size is 26px, with 18 and 16 following from it. It is given here as
   * the top of a clamp: the banner is 110px tall on a phone with a robin on its
   * left and a court on its right, and 26 in what is left over would wrap on
   * anything narrower than a large phone. See the caller for the width it
   * actually gets.
   */
  size: string;
  /**
   * Colour of the description. Black by default, and given only where the mark
   * sits on something dark — the settings drawer, which is navy.
   */
  subtitleColor?: string;
  /**
   * Draws the sport above the name. On by default, because the banner is where
   * the mark is drawn in full and every step of the app shows it.
   *
   * The watchers' page passes it off. Somebody there scanned a code at a court
   * they are standing on, so the word tells them nothing they can't see, and
   * that banner already carries a MADE WITH line above the name.
   */
  sport?: boolean;
  className?: string;
}

/**
 * The two other lines, as shares of the name.
 *
 * Three steps down the scale in `docs/ui-audit.md`, one apart: the name at 26,
 * the description at `text-lg` and the sport at `text-base`. Ratios and not
 * sizes, so the whole mark moves together with the clamp its caller gives it
 * and cannot come apart at some width nobody tested.
 */
const SUBTITLE_RATIO = 18 / 26;
const SPORT_RATIO = 16 / 26;

export function AppWordmark({
  size,
  subtitleColor = INK,
  sport = true,
  className = '',
}: AppWordmarkProps) {
  return (
    <span className={`block min-w-0 ${className}`}>
      {/* Uppercase, and tracked out the way the banner's eyebrow is: caps set
          tight read as a block rather than as words. Bold rather than the
          name's own weight, and in the app's near-black, so it states the sport
          and then hands the eye down to the orange. */}
      {sport && (
        <span
          className="block font-bold uppercase leading-none tracking-[0.12em] mb-[0.2em]"
          style={{ fontSize: `calc(${size} * ${SPORT_RATIO})`, color: INK }}
        >
          {APP_SPORT}
        </span>
      )}
      <span
        className="block font-bold leading-[1.1] tracking-tight text-brand-orange"
        style={{ fontSize: size }}
      >
        {APP_NAME}
      </span>
      {/* Semibold, not bold: at this size a third bold line
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
