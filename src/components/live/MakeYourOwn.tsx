import { APP_URL } from '../../lib/appInfo';

/**
 * The one thing this page is selling, at the foot of somebody else's session.
 *
 * A visitor scanned a code at a court and has just watched an afternoon run
 * itself. This is the moment to say what did that, so the panel is the app's
 * own banner artwork rather than a line of text: the same orange wedge and
 * halftone, the same court and ball, the same robin.
 *
 * **Every piece of artwork here carries its own cream margin, and that is the
 * whole layout.** The first version cut a window out of the banner's left piece
 * to hide the robin baked into it, and the bottom of that window fell across
 * solid orange — which read exactly like a cream rectangle laid over the
 * picture, because that is what it was. Nothing is cropped at draw time now.
 * `panel-corner.png` and `panel-dots.png` are cut from the banner ahead of time
 * with the badge taken out, and each is simply dropped in a corner. Where the
 * artwork ends, its own background carries on, and its background is this
 * panel's — so there is no edge to see and nothing to clip.
 *
 * All three pieces are made by `tools/make-panel-corners.mjs`, which is kept
 * because the numbers in it were measured off the source rather than chosen:
 * re-run it if the banner art is ever replaced.
 *
 * The court behaves the same way. `header-right.jpg` was cream across 81.8% of
 * its top edge and 98% of its left — but the last 18% of that top edge was the
 * court's own far corner in solid teal, and against cream that is a short
 * horizontal line sitting in the middle of the panel. The same fault in
 * miniature. `panel-court.png` carries the cream over that corner, trimming the
 * court along a line that leaves through the right edge instead of the top, so
 * both edges that fall inside the panel are cream and the two that are not are
 * the two it is anchored to.
 *
 * Cream is #FBFAF6 because that is the colour baked into all three, sampled
 * rather than guessed. Any other panel colour and the artwork shows as
 * rectangles again.
 */

const CREAM = '#FBFAF6';
const NAVY = '#051829';

export function MakeYourOwn() {
  return (
    // Two boxes rather than one. The badge hangs above the panel's top edge and
    // the panel has to clip its artwork to its own corners, so the thing that
    // bleeds cannot live inside the thing that clips. mt-12 is the room the
    // badge takes above.
    //
    // Held to a card's width rather than the page's. The rounds above it fill a
    // desktop, and an advert stretched to the same width would be the loudest
    // thing on a page that is somebody else's session.
    <div className="relative mx-auto mt-12 max-w-lg">
      {/* The white frame and its shadow, lifting the panel off the page the way
          a photo print is lifted off a mount. The cream box inside it is what
          clips the artwork. */}
      <div className="rounded-[1.25rem] bg-white p-1.5 shadow-lg ring-1 ring-black/5">
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{ backgroundColor: CREAM }}
        >
          {/* The banner's wedge, in the corner it belongs to. No window and no
              crop: below and right of the orange this image is already cream. */}
          <img
            src="/panel-corner.png"
            alt=""
            width={280}
            height={180}
            className="pointer-events-none absolute left-0 top-0 w-[38%] max-w-[190px] select-none"
            aria-hidden="true"
          />

          {/* Its teal halftone, turned to fan out of the opposite corner. */}
          <img
            src="/panel-dots.png"
            alt=""
            width={180}
            height={68}
            className="pointer-events-none absolute right-0 top-0 w-[30%] max-w-[150px] -scale-100 select-none"
            aria-hidden="true"
          />

          {/* The court, held in the corner it holds at the end of the banner,
              and cream along both of the edges that fall inside the panel. */}
          <img
            src="/panel-court.png"
            alt=""
            width={352}
            height={264}
            className="pointer-events-none absolute bottom-0 right-0 w-[52%] max-w-[220px] select-none"
            aria-hidden="true"
          />

          {/* Above the artwork and out of its way: the type sits in the cream
              between the corners.

              The deep bottom padding is for the ball. On a phone the button is
              wide enough to reach the court corner, so the type stops higher and
              leaves the ball its own air; past that the button is capped well
              clear of it and the padding goes back to normal. */}
          <div className="relative px-5 pb-16 pt-9 text-center sm:pb-8">
            {/* Two lines, said as two lines. Left to itself the heading breaks
                wherever the panel's width happens to put it, and "Make your own
                round / robin" is the one break that reads worst.

                The {' '} between them is not decoration: two block spans put
                their text nodes side by side with nothing in between, so the
                heading would read "Make your ownround robin" to a screen reader
                and to anything else that takes it as text. Whitespace between
                block boxes is not drawn, so it costs nothing on screen. */}
            <h2
              className="text-[2rem] font-extrabold leading-[1.1] tracking-tight"
              style={{ color: NAVY }}
            >
              <span className="block">Make your own</span>{' '}
              <span className="block">round robin</span>
            </h2>
            <p className="mt-1.5 text-lg font-medium text-[#5B6675]">
              Balanced matchups in seconds.
            </p>
            <p
              className="mt-2 text-sm font-bold uppercase tracking-wide"
              style={{ color: NAVY }}
            >
              Free <Dot /> No ads <Dot /> No tracking
            </p>
            <a
              href={APP_URL}
              // Capped well short of the panel, so the court keeps its ball
              // rather than having the button laid across it.
              className="mx-auto mt-4 block w-full max-w-[240px] rounded-lg bg-brand-orange px-5 py-2.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-brand-orange-dark"
            >
              Create a round robin
            </a>
          </div>
        </div>
      </div>

      {/* Outside both boxes, so its top half is genuinely over the edge. The
          white disc is what holds it off the cream, as the badge on the banner
          is held off the artwork behind it. */}
      <img
        src="/logo.png"
        alt=""
        width={913}
        height={907}
        className="absolute -top-8 left-1/2 h-16 w-16 -translate-x-1/2 select-none rounded-full bg-white p-1 shadow-sm ring-1 ring-black/5"
        aria-hidden="true"
      />
    </div>
  );
}

/** The separator between the three claims, in the app's orange. */
function Dot() {
  return <span className="mx-1.5 text-brand-orange">&bull;</span>;
}
