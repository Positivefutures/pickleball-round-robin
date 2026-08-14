import { useEffect, useState, type ReactNode } from 'react';
import { DIM } from '../../lib/tourGeometry';

/** The header's cream, so the sheet and the banner above it are the same paper. */
const CREAM = '#FBFAF6';

/** The robin's own navy, as the Setup heading uses it. */
const INK = '#051829';

/**
 * The panel that opens the tour and the panel that closes it.
 *
 * It was a full-screen splash, shown before anything else. That asked somebody
 * to agree to a tour of an app they had not seen a pixel of, and it made the
 * first thing a new install ever drew a page with no players on it. A sheet
 * rising over the Players tab a couple of seconds in asks the same question with
 * the answer already visible behind it.
 *
 * The same component at both ends on purpose: finishing something should look
 * like the thing that started it.
 *
 * There is no Skip here. The opener's Continue is the only button because the
 * tour behind it carries a Skip on every card, and the closer's Done is the only
 * button because by then there is nothing left to skip.
 *
 * Mounted by App outside `.app-panel`, and it takes no scroll lock of its own —
 * App's single aggregate holds it, because a second lock on a pinned body reads
 * the scroll offset as zero.
 */
export function TourSheet({
  title,
  children,
  buttonLabel,
  onPress,
}: {
  title: string;
  children: ReactNode;
  buttonLabel: string;
  onPress: () => void;
}) {
  // Off the bottom for the first frame, then let the transition carry it up.
  // Setting both in one render would leave nothing to animate between.
  const [up, setUp] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setUp(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="no-print fixed inset-0 z-50 flex flex-col justify-end">
      {/* The page stays visible underneath, quietened rather than hidden. It is
          the thing being introduced. */}
      <div className="absolute inset-0" style={{ backgroundColor: DIM }} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // sheet-panel is the app's own sliding-sheet class, which the reduced
        // motion block in index.css already switches off. See ActionsSheet.
        className={`sheet-panel relative rounded-t-3xl px-7 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-7 text-center shadow-[0_-10px_40px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-out ${
          up ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ backgroundColor: CREAM }}
      >
        <div className="mx-auto flex w-full max-w-sm flex-col items-center">
          {/* logo.png rather than the home screen icon, which is the same robin
              but painted onto an opaque white square — on cream that reads as a
              white tile with a bird in it. This one carries its alpha. */}
          <img
            src="/logo.png"
            alt=""
            width={913}
            height={907}
            className="h-[4.5rem] w-[4.5rem] select-none"
          />

          <h1
            className="mt-3 text-[1.9rem] font-extrabold leading-tight tracking-tight"
            style={{ color: INK }}
          >
            {title}
          </h1>

          <div className="mt-3 space-y-3 text-lg leading-relaxed text-[#3A4353]">{children}</div>

          <button
            type="button"
            onClick={onPress}
            className="mt-6 w-full rounded-2xl bg-brand-orange px-6 py-4 text-xl font-bold text-white shadow-lg transition-colors hover:bg-brand-orange-dark"
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
