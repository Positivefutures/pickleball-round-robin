/**
 * The banner across the top of every step.
 *
 * The artwork is one 3:1 design cut into two pieces that sit against the left
 * and right edges, with flat cream between them doing all the stretching. It
 * has to work that way because the title is live text of any length and the
 * header spans everything from a phone to a desktop, so a single image would
 * either squash or crop the type.
 *
 * Both pieces were cut from `INBOX/header-3.png` (2175x723) at columns 0..766
 * and 1211..2174 — the exact points where the art stops and the cream is flat —
 * then scaled to 264px tall. They ship opaque with #FBFAF6 baked in, the same
 * as the panel illustrations, so the joins against the background are invisible.
 */

import type { ReactNode } from 'react';
import { ChevronDownIcon } from '../icons';

/** The banner's height. Every other measurement here is a multiple of it. */
const HEIGHT = 'clamp(110px, 26.25vw, 165px)';

/**
 * Width of the court piece as a multiple of the height. The left piece needs no
 * such constant: nothing is ever cropped off it, so its height alone sizes it.
 */
const RIGHT_ASPECT = 1.3333;

/**
 * How far in the title starts, clearing the robin badge and its white halo.
 * Taken from where the mockup's own type began, at 0.66 of the banner height.
 */
const TITLE_INSET = 0.66;

/**
 * What the title keeps for itself before the court starts being cropped away.
 * Below this the court slides off the right edge rather than squeezing the
 * name any further.
 */
const TITLE_MIN = '11rem';

const CREAM = '#FBFAF6';
const NAVY = '#051829';

/**
 * A hairline closing the banner off at both ends.
 *
 * The cream runs almost the same value as the page behind the tabs, so without
 * a rule the artwork has no bottom and the two just bleed into one another. The
 * top edge has the same problem against the safe-area band below the clock,
 * which is the same cream again, so it takes the same line.
 *
 * Both are drawn inside the height rather than added to it, so nothing below
 * moves.
 */
const RULE = '#D2D2D2';

interface HeaderProps {
  /** Shown in the banner — the app name on the roster step, the group name after. */
  title: string;
  settingsOpen?: boolean;
  /** Omitted on the live view, which has no drawer; the button is not drawn. */
  onToggleSettings?: () => void;
  /**
   * Makes the title the way to another group, with a chevron after it. Omitted
   * where the title is the app's own name and leads nowhere.
   */
  onTitleClick?: () => void;
  /**
   * Makes the title a link instead. The live view sends a visitor to the app
   * itself, which is a real address rather than something that happens inside
   * this page — so it is an anchor, and can be opened in a new tab, copied, or
   * read out as the link it is. No chevron: on this banner that mark means
   * "pick another group".
   */
  titleHref?: string;
  /** Omitted on steps with nothing worth printing, which hides the button. */
  onPrint?: () => void;
  /**
   * Sits where the buttons do, before them. The live view's LIVE pill, on a
   * page that has neither button to keep it company.
   */
  corner?: ReactNode;
}

export function Header({
  title,
  settingsOpen = false,
  onToggleSettings,
  onTitleClick,
  titleHref,
  onPrint,
  corner,
}: HeaderProps) {
  // Both buttons have to stay legible wherever the diagonal happens to fall
  // behind them, which is teal at their right and cream at their left on a
  // narrow screen. A solid fill reads on either; an outline does not.
  const button =
    'flex h-10 w-12 items-center justify-center rounded-md shadow-sm transition-colors';

  return (
    <>
      {/* The strip behind the clock and the battery, in flat cream.

          iOS 26 stopped leaving that strip to the system. It draws Liquid Glass
          there instead, which samples the page's own top rows, blurs and
          lightens them, and feathers the result about 35pt down into the page.
          This banner puts its orange wedge and its teal court on its first row,
          so what arrived was a smear of both across the clock and on down over
          the robin.

          The effect cannot be turned off from a web page. What it blurs can be
          changed, though, and a blur of flat cream is flat cream. So
          `viewport-fit=cover` in index.html takes the strip back, and this fills
          it with the colour the banner already sits on. The banner itself starts
          below it, where it has always started, and stays sharp.

          Nothing moves anywhere else: off iOS, and on any iOS that does not
          claim the strip, `env(safe-area-inset-top)` is 0 and this is a
          zero-height div. */}
      <div
        aria-hidden="true"
        className="no-print"
        style={{ height: 'env(safe-area-inset-top)', backgroundColor: CREAM }}
      />

      <header
        className="relative isolate overflow-hidden no-print"
        style={{
          height: HEIGHT,
          backgroundColor: CREAM,
          borderTop: `1px solid ${RULE}`,
          borderBottom: `1px solid ${RULE}`,
        }}
      >
        {/* Wedge, halftone fade, badge and dots. Pinned left, height drives it. */}
        <img
          src="/header-left.png"
          alt=""
          width={280}
          height={264}
          className="pointer-events-none absolute inset-y-0 left-0 h-full w-auto max-w-none select-none"
        />

        {/* The court, in a window anchored to the right edge with the image held
            against the window's left. Narrowing the window therefore eats the
            picture from its right: the leading diagonal survives and the ball is
            what goes over the side, which is what should happen on a phone. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 overflow-hidden"
          style={{
            width: `min(calc(${RIGHT_ASPECT} * ${HEIGHT}), calc(100% - ${TITLE_MIN}))`,
          }}
        >
          <img
            src="/header-right.jpg"
            alt=""
            width={352}
            height={264}
            className="absolute inset-y-0 left-0 h-full w-auto max-w-none select-none"
          />
        </div>

        <div
          className="relative flex h-full items-center"
          style={{
            paddingLeft: `calc(${TITLE_INSET} * ${HEIGHT})`,
            // Clears the buttons, and the court's diagonal where it reaches
            // furthest in across the title's lowest line.
            paddingRight: `max(7.5rem, calc(0.95 * ${HEIGHT}))`,
          }}
        >
          {/* Clamped rather than truncated: three lines is enough for the longest
              name worth reading, and a fourth would push the banner open. Three
              lines of the largest size still sit inside the banner at every width,
              which is what holds the clamp's top end where it is. */}
          <h1
            className="min-w-0 line-clamp-3 text-[clamp(1.365rem,4.42vw,2.275rem)] font-bold leading-tight tracking-tight"
            style={{ color: NAVY }}
          >
            {titleHref ? (
              <a href={titleHref} className="hover:opacity-70 transition-opacity">
                {title}
              </a>
            ) : onTitleClick ? (
              /* The whole name is the target, which on a phone is the only tap
                 area big enough to be worth having. The chevron runs on from the
                 last word rather than sitting in a corner of its own, so a name
                 that wraps to three lines keeps it. */
              <button
                type="button"
                onClick={onTitleClick}
                aria-haspopup="dialog"
                className="text-left hover:opacity-70 transition-opacity"
              >
                {title}
                {/* Sized against the title rather than in pixels, so it holds its
                    share of the line at every width the banner clamps to. The
                    glyph is a thin chevron inside a 24 box, so it needs most of a
                    full em to carry against type this heavy. */}
                <ChevronDownIcon
                  className="ml-[0.15em] inline-block h-[0.9em] w-[0.9em] align-[-0.12em]"
                />
              </button>
            ) : (
              title
            )}
          </h1>
        </div>

        {/* Held to the top rather than centred: the ball sits across the lower
            half of the court, and a button parked on top of it reads as a
            mistake. Up here the diagonal is shallow, so the left button laps
            onto the cream — which is why both are filled rather than outlined. */}
        <div className="absolute right-3 top-2 z-10 flex items-center gap-2">
          {corner}
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              aria-label="Print / Save PDF"
              title="Print / Save PDF"
              className={`${button} bg-white/95 ring-1 ring-black/10 hover:bg-white`}
              style={{ color: NAVY }}
            >
              <svg
                width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </button>
          )}
          {/* Stays on screen in the sliver of panel left visible when the drawer
              is open, so the same button closes it again. */}
          {onToggleSettings && (
            <button
              type="button"
              onClick={onToggleSettings}
              aria-expanded={settingsOpen}
              aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
              title="Settings"
              className={`${button} ${
                settingsOpen ? 'text-white' : 'bg-white/95 ring-1 ring-black/10 hover:bg-white'
              }`}
              style={settingsOpen ? { backgroundColor: NAVY } : { color: NAVY }}
            >
              <svg
                width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </header>
    </>
  );
}
