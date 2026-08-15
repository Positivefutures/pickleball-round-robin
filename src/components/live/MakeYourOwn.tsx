import { APP_URL } from '../../lib/appInfo';

/**
 * The one thing this page is selling, at the foot of somebody else's session.
 *
 * A visitor scanned a code at a court and has just watched an afternoon run
 * itself. This is the moment to say what did that, so the panel is the app's
 * own banner artwork rather than a line of text: the same orange wedge and
 * halftone, the same court and ball, the same robin.
 *
 * Both pieces are the banner's, drawn from `public/` rather than copied. The
 * left one carries the robin badge a third of the way down, which would be a
 * second robin under the one on top, so it is shown through a window cut above
 * it — the strip of wedge and dots and nothing else. `LEFT_SHOW` is where that
 * window ends, measured on the source: the badge begins at 27% of the piece's
 * height, and stopping at a quarter leaves it out with a little to spare.
 *
 * Cream is #FBFAF6 because both images ship opaque with it baked in, the same
 * as the banner. Any other panel colour and the artwork shows as rectangles.
 */

const CREAM = '#FBFAF6';
const NAVY = '#051829';
const EDGE = '#E4E0D6';

/** Width of the top-left artwork, and how much of its height is shown. */
const LEFT_WIDTH = 190;
const LEFT_SHOW = 0.25;

export function MakeYourOwn() {
  return (
    // Two boxes rather than one. The badge hangs above the panel's top edge,
    // and the panel has to clip its own artwork to its corners, so the thing
    // that bleeds cannot live inside the thing that clips. mt-10 is the room
    // the badge takes above.
    // Held to a card's width rather than the page's. The rounds above it fill
    // a desktop; an advert stretched to the same width would be the loudest
    // thing on a page that is somebody else's session.
    <div className="relative mx-auto mt-10 max-w-lg">
      <div
        className="relative overflow-hidden rounded-2xl border shadow-sm"
        style={{ backgroundColor: CREAM, borderColor: EDGE }}
      >
      {/* The banner's left piece, cut off above its robin. */}
      <div
        className="pointer-events-none absolute left-0 top-0 overflow-hidden"
        style={{ width: LEFT_WIDTH, height: LEFT_WIDTH * (264 / 280) * LEFT_SHOW }}
        aria-hidden="true"
      >
        <img
          src="/header-left.png"
          alt=""
          width={280}
          height={264}
          className="select-none"
          style={{ width: LEFT_WIDTH, maxWidth: 'none' }}
        />
      </div>

      {/* The court, held in the corner the way it holds the banner's end. */}
      <img
        src="/header-right.jpg"
        alt=""
        width={352}
        height={264}
        className="pointer-events-none absolute bottom-0 right-0 w-[40%] max-w-[150px] select-none"
        aria-hidden="true"
      />

        {/* Above the artwork, and out of its way: the type sits in the cream
            between the two corners. */}
        {/* The deep bottom padding is for the ball. On a phone the button is
            nearly the panel's width and the court corner is behind its right
            end, so the type stops higher and leaves the ball its own air. Wider
            than that the button is capped well clear of the corner and the
            padding goes back to normal. */}
        <div className="relative px-5 pb-14 pt-10 text-center sm:pb-6">
          {/* text-balance so the two lines come out even. Left to itself the
              first line runs to the panel's edge and drops "robin" alone. */}
          <h2
            className="text-balance text-[1.75rem] font-extrabold leading-tight tracking-tight"
            style={{ color: NAVY }}
          >
            Make your own round robin
          </h2>
          <p className="mt-1 text-lg font-medium text-[#5B6675]">
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
            // Capped and centred, so the court in the corner keeps its ball
            // rather than having the button laid across it.
            className="mx-auto mt-4 block w-full max-w-[320px] rounded-lg bg-brand-orange px-4 py-3 text-lg font-bold text-white shadow-sm transition-colors hover:bg-brand-orange-dark"
          >
            Open Round Robin Generator
          </a>
        </div>
      </div>

      {/* Outside the panel, so its top half is genuinely over the edge. The
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
