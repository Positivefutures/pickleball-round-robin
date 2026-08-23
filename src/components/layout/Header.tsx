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
import { ChevronDownIcon, GroupSolidIcon } from '../icons';
import { AppWordmark } from './AppWordmark';

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
 *
 * Raised from 11rem when the banner started carrying the wordmark. A group's
 * name breaks between words and can take three lines; "Round Robin Generator"
 * set under the name is one line that either fits or wraps, and on a phone the
 * difference between it fitting and not was about a centimetre of court.
 */
const TITLE_MIN = '12rem';

/**
 * The court window's width, which is the picture's own 4:3 until the title's
 * floor takes precedence. Written once because the padding that keeps the type
 * off the court is measured from it.
 */
const COURT_WIDTH = `min(calc(${RIGHT_ASPECT} * ${HEIGHT}), calc(100% - ${TITLE_MIN}))`;

/**
 * How far the court's leading diagonal has come in by the time it is level with
 * the bottom of the title, as a share of the banner's height measured from the
 * court picture's own left edge.
 *
 * Read off `header-right.jpg` rather than judged by eye: sampling the first
 * non-cream pixel of each row of that 352x264 file gives 0.53H at its middle
 * and 0.28H at three quarters down, falling almost exactly in a straight line.
 * The title's last line lands around 0.72 of the banner, and 0.29 is the
 * diagonal there. Taking it at the title's foot rather than at its middle is
 * the point: that is the row where the court reaches furthest into the type.
 *
 * This replaced a flat `0.95 * HEIGHT`, which was the same measurement taken
 * once for a three-line title and then left to apply to every other shape.
 */
const INK_AT_TITLE_FOOT = 0.29;

/**
 * The corner row, in pixels, so the title can be told how much of the right
 * edge is already spoken for.
 *
 * These are the row's own Tailwind values read back as numbers: `right-3` is
 * the 12 it is inset by, `gap-2` the 8 between items, `h-10 w-12` the 48 each
 * button is. The pill is the one measurement that is not a class on this file —
 * `LivePill` is `px-2.5` around an 8px dot, a `gap-1.5` and "LIVE" at `text-xs`
 * bold, which comes to 64. It is only ever the outer term of a `max()`, so a
 * few pixels either way costs nothing.
 */
const CORNER_EDGE = 12;
const CORNER_GAP = 8;
const CORNER_BUTTON = 48;
const CORNER_PILL = 64;

/**
 * The wordmark's top line in the banner. The line under it follows from it.
 *
 * Jeff's size is 26px, and 26 is where this tops out. It cannot simply *be* 26:
 * "Round Robin Generator" under the name is the wider of the two lines and does
 * not break between words without looking broken, and on a 360px phone the strip
 * left between the robin and the court is about 190px — which is 26px of name
 * and 20px of description overflowing it by a third.
 *
 * So it is a clamp, and the middle term is a straight line rather than a bare
 * `vw`: below 420px the banner's height has bottomed out at 110px, so the robin
 * and the court cost a fixed number of pixels and the strip left for the title
 * grows one for one with the viewport. That strip is `100vw - 187px`, and the
 * description costs a shade under 8px of width for each pixel of type — which
 * is where `12.5vw - 24px` comes from, with a few pixels held back so a font
 * that is not the one this was measured in has somewhere to go.
 *
 * It reaches Jeff's 26 at 400px and holds there for every screen above it, so
 * every phone from the iPhone 12 mini up is within about a pixel of full size
 * and a desktop is exactly it. Below 320px the description wraps, and there is
 * no size worth reading that would stop it: at that width the robin and the
 * court have already taken two thirds of the banner.
 */
const WORDMARK_SIZE = 'clamp(1.25rem, calc(12.5vw - 24px), 1.625rem)';

/**
 * Where the robin badge sits inside the left-hand piece, as fractions of the
 * banner's height.
 *
 * The badge is painted into `header-left.png` rather than being an element, so
 * the only way to make it tappable is a box laid over where it lands. Measured
 * off the file rather than judged by eye: its navy ring runs x 40..141 and
 * y 76..179 in a picture 280x264, and the picture is drawn at the banner's own
 * height with its top-left in the corner, so each of those over 264 is a share
 * of `HEIGHT` and stays true at every width the banner clamps to.
 */
const BADGE = { left: 40 / 264, top: 76 / 264, width: 102 / 264, height: 104 / 264 };

/**
 * How wide the badge is drawn, as a CSS length rather than a number.
 *
 * Exported for the viewer's notices, which put the same robin over a message
 * at a multiple of this — `logo.png` is that badge on transparency, ring and
 * all. A pixel count there would say nothing about the banner and would drift
 * the moment the banner is resized. This cannot.
 */
export const BADGE_SIZE = `calc(${BADGE.width} * ${HEIGHT})`;

/**
 * The disc that hides the robin where another mark stands in for it.
 *
 * The badge is painted as a navy ring on a white disc that carries on past the
 * ring as a halo, so anything that covers the ring and stops inside the halo
 * leaves no seam and needs no second picture. The gap was measured off the file
 * the same way the ring was: the ring's outer edge is 52 from the badge's
 * centre, and every pixel between 54 and 58 out is #FEFEFE the whole way round.
 * 56 sits in the middle of that, and is the radius used here.
 */
const PATCH = 112 / 264;

/** The ring redrawn at the painted one's measurements: 103 across, 3 thick. */
const RING = 103 / 264;
const RING_WEIGHT = 3 / 264;

/**
 * The mark inside it. The groups artwork is wider than it is tall and sits
 * centred in a square, so this is that square's side: at 74 the outermost of
 * the three figures still clears the inside of the ring by 6.
 */
const MARK = 74 / 264;

/** Everything above is a share of the banner's height. This spends them. */
const span = (share: number) => `calc(${share} * ${HEIGHT})`;

const CREAM = '#FBFAF6';
const NAVY = '#051829';

/** The white the halo runs, so the patch lands on its own colour. */
const HALO = '#FEFEFE';

/**
 * A hairline closing the banner off at both ends.
 *
 * The cream runs almost the same value as the page behind the tabs, so without
 * a rule the artwork has no bottom and the two just bleed into one another. The
 * top edge has the same problem against iOS's own status bar, which theme-color
 * paints in the same cream again, so it takes the same line.
 *
 * Both are drawn inside the height rather than added to it, so nothing below
 * moves.
 */
const RULE = '#D2D2D2';

interface HeaderProps {
  /** Shown in the banner — the app name on the roster step, the group name after. */
  title: string;
  /**
   * Draws the app's own two-line mark instead of setting `title` as plain type.
   *
   * `title` is still required and still what the badge and the link are labelled
   * with, because the mark is two coloured lines to look at and one name to a
   * screen reader. Every caller that passes this passes `APP_FULL_NAME`.
   */
  wordmark?: boolean;
  /**
   * Which mark sits beside the title. The robin is the app's own, and is what
   * the artwork is painted with; `groups` covers it with the three-person mark
   * for the steps where the title is a group's name rather than the app's.
   */
  badge?: 'robin' | 'groups';
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
   * A small line above the title, which the title then sits under and reads on
   * from. Only the live view uses it: a visitor who scanned a code is looking
   * at somebody else's session, so the app's name needs saying as the thing it
   * was made with rather than as the page they are on.
   */
  eyebrow?: string;
  /**
   * Whether the wordmark carries the sport above the name. On everywhere the
   * host sees, off on the watchers' page, which says MADE WITH above the name
   * already and is read by somebody standing on the court in question.
   *
   * Ignored unless `wordmark` is set: with a group's name in the banner there
   * is no mark to put a line above.
   */
  sport?: boolean;
  /**
   * Sits where the buttons do, before them. The live view's LIVE pill, on a
   * page that has neither button to keep it company.
   */
  corner?: ReactNode;
}

export function Header({
  title,
  wordmark = false,
  badge = 'robin',
  settingsOpen = false,
  onToggleSettings,
  onTitleClick,
  titleHref,
  onPrint,
  eyebrow,
  sport = true,
  corner,
}: HeaderProps) {
  // What the corner row actually comes to, which is what the title has to keep
  // clear of. Nothing here is measured at runtime: the row's contents are known
  // from the props, and a layout that waited for a measurement would move the
  // name after the banner had already been drawn.
  const cornerItems = [
    corner ? CORNER_PILL : 0,
    onPrint ? CORNER_BUTTON : 0,
    onToggleSettings ? CORNER_BUTTON : 0,
  ].filter(Boolean);
  const cornerWidth = cornerItems.length
    ? `${CORNER_EDGE * 2 + cornerItems.reduce((a, b) => a + b, 0) + CORNER_GAP * (cornerItems.length - 1)}px`
    : '0px';

  // Both buttons have to stay legible wherever the diagonal happens to fall
  // behind them, which is teal at their right and cream at their left on a
  // narrow screen. A solid fill reads on either; an outline does not.
  const button =
    'flex h-10 w-12 items-center justify-center rounded-md shadow-sm transition-colors';

  return (
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
        style={{ width: COURT_WIDTH }}
      >
        <img
          src="/header-right.jpg"
          alt=""
          width={352}
          height={264}
          className="absolute inset-y-0 left-0 h-full w-auto max-w-none select-none"
        />
      </div>

      {/* The groups mark, taking the badge over on the steps whose title is a
          group's name. Painted over the robin rather than swapped into the
          artwork: the ring's surroundings are white out to the halo's edge, so
          a disc landing in between covers the bird and leaves the badge looking
          as drawn — at every width, since all of this is sized off the same
          height the picture is. Not a target: on these steps the name already
          opens the group picker, and a badge that did it too would be the same
          answer said twice. */}
      {badge === 'groups' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute grid place-items-center rounded-full"
          style={{
            left: span(BADGE.left + BADGE.width / 2 - PATCH / 2),
            top: span(BADGE.top + BADGE.height / 2 - PATCH / 2),
            width: span(PATCH),
            height: span(PATCH),
            backgroundColor: HALO,
            color: NAVY,
          }}
        >
          <div
            className="grid place-items-center rounded-full"
            style={{
              width: span(RING),
              height: span(RING),
              borderStyle: 'solid',
              borderWidth: span(RING_WEIGHT),
              borderColor: NAVY,
            }}
          >
            <div style={{ width: span(MARK), height: span(MARK) }}>
              <GroupSolidIcon className="w-full h-full" />
            </div>
          </div>
        </div>
      )}

      {/* The badge, made the same door the name is. Only where the name is a
          link: on the host's banner the title opens the group picker, and a
          badge that went somewhere else instead would be a second answer to
          the same tap. Nothing is drawn here — the picture underneath is the
          whole of what is seen, and this only catches the finger. */}
      {titleHref && (
        <a
          href={titleHref}
          aria-label={title}
          className="absolute z-10 rounded-full"
          style={{
            left: span(BADGE.left),
            top: span(BADGE.top),
            width: span(BADGE.width),
            height: span(BADGE.height),
          }}
        />
      )}

      <div
        className="relative flex h-full items-center"
        style={{
          paddingLeft: `calc(${TITLE_INSET} * ${HEIGHT})`,
          // Two things stand to the title's right and either can be the wider:
          // the buttons in the corner, and the court's diagonal where it reaches
          // furthest in across the title's lowest line. The corner term counts
          // what is actually drawn rather than assuming both buttons — the step
          // that carries the wordmark is also the one with nothing to print, and
          // a 48px allowance for a button that is not there was costing the name
          // a syllable on a phone.
          paddingRight: `max(${cornerWidth}, calc(${COURT_WIDTH} - ${INK_AT_TITLE_FOOT} * ${HEIGHT}))`,
        }}
      >
        <div className="min-w-0">
          {/* Above the title, and centred with it rather than added on top: the
              pair drops by half this line's height, so the title moves down a
              little and the banner does not grow. Small, but uppercase and bold
              at a size that still holds on the narrowest phone. */}
          {eyebrow && (
            <p
              className="text-[clamp(0.6875rem,2vw,0.875rem)] font-bold uppercase leading-none tracking-[0.12em] opacity-70 mb-[0.4em]"
              style={{ color: NAVY }}
            >
              {/* The same address as the name under it, and no styling of its
                  own: Tailwind's reset leaves an anchor the colour and the
                  decoration of whatever it sits in, so this reads exactly as it
                  did before it was a link. */}
              {titleHref ? <a href={titleHref}>{eyebrow}</a> : eyebrow}
            </p>
          )}

          {/* Clamped rather than truncated: three lines is enough for the longest
              name worth reading, and a fourth would push the banner open. Three
              lines of the largest size still sit inside the banner at every width,
              which is what holds the clamp's top end where it is.

              The clamp is skipped for the wordmark, which is two lines by
              construction and sets its own sizes. */}
          <h1
            className={`min-w-0 font-bold leading-tight tracking-tight ${
              wordmark ? '' : 'line-clamp-3 text-[clamp(1.365rem,4.42vw,2.275rem)]'
            }`}
            style={{ color: NAVY }}
          >
            {titleHref ? (
              <a href={titleHref} className="hover:opacity-70 transition-opacity">
                {wordmark ? <AppWordmark size={WORDMARK_SIZE} sport={sport} /> : title}
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
                {wordmark ? <AppWordmark size={WORDMARK_SIZE} sport={sport} /> : title}
                {/* Sized against the title rather than in pixels, so it holds its
                    share of the line at every width the banner clamps to. The
                    glyph is a thin chevron inside a 24 box, so it needs most of a
                    full em to carry against type this heavy. */}
                <ChevronDownIcon
                  className="ml-[0.15em] inline-block h-[0.9em] w-[0.9em] align-[-0.12em]"
                />
              </button>
            ) : wordmark ? (
              <AppWordmark size={WORDMARK_SIZE} sport={sport} />
            ) : (
              title
            )}
          </h1>
        </div>
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
  );
}
