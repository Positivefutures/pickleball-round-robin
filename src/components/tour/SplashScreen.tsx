import { EXAMPLE_ROSTER } from '../../lib/exampleGroup';

/** The header's cream, so the first screen and the second are the same paper. */
const CREAM = '#FBFAF6';

/** The robin's own navy, as the Setup heading uses it. */
const INK = '#051829';

/**
 * The first thing a brand new install ever shows.
 *
 * There is no Skip here and no second door. A fresh install has one group it did
 * not make and no idea what the app is for, so the only useful thing it can
 * offer is to show them — and the tour behind Continue has a Skip on every card
 * for anybody who changes their mind a second later.
 *
 * The player count is read off the roster rather than written into the sentence,
 * because that number is load-bearing elsewhere: the tour tells the host to tap
 * Select All, and the group is sized so that fills the courts and still sits two
 * people out. Changing the roster and leaving the promise behind would be the
 * easiest mistake here to make.
 *
 * Mounted by App outside `.app-panel`, and it takes no scroll lock of its own —
 * App's single aggregate holds it, because a second lock on a pinned body reads
 * the scroll offset as zero.
 */
export function SplashScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome"
      className="no-print fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-7 text-center"
      style={{ backgroundColor: CREAM }}
    >
      {/* The same halftone the Setup panel wears, twice, turned so the clusters
          lean out of opposite corners. It ships without an alpha channel, which
          on the panel does not matter because the panel is white — here it would
          be two white plates on cream, so it is multiplied instead: white takes
          the paper's colour and only the dots survive. Decoration, so it is
          untappable and unreadable, and it sits behind the words on a short
          screen rather than pushing them about. */}
      <img
        src="/corner-dots.png"
        alt=""
        aria-hidden="true"
        width={144}
        height={126}
        className="pointer-events-none absolute -right-5 top-4 w-28 select-none opacity-70 mix-blend-multiply"
      />
      <img
        src="/corner-dots.png"
        alt=""
        aria-hidden="true"
        width={144}
        height={126}
        className="pointer-events-none absolute -left-5 bottom-4 w-28 -scale-x-100 select-none opacity-70 mix-blend-multiply"
      />

      <div className="relative flex w-full max-w-sm flex-col items-center">
        {/* logo.png rather than the home screen icon, which is the same robin
            but painted onto an opaque white square — on cream that reads as a
            white tile with a bird in it. This one carries its alpha, is sharp
            at 913px, and costs a sixth as much to fetch. */}
        <img
          src="/logo.png"
          alt=""
          width={913}
          height={907}
          className="h-[9.5rem] w-[9.5rem] select-none"
        />

        <h1
          className="mt-7 text-[2.5rem] font-extrabold leading-[1.1] tracking-tight"
          style={{ color: INK }}
        >
          Try the app
          <br />
          right away
        </h1>

        <p className="mt-5 text-xl leading-relaxed text-[#3A4353]">
          We&rsquo;ve added a sample group with {EXAMPLE_ROSTER.length} players. Use it to
          create a round robin and see how everything works.
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="mt-10 w-full rounded-2xl bg-brand-orange px-6 py-4 text-xl font-bold text-white shadow-lg transition-colors hover:bg-brand-orange-dark"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
