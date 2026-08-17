import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { formatMMSS } from '../../lib/roundTimer';
import { CloseIcon } from '../icons';
import { TimerIcon } from './timerIcons';

/**
 * What a round timer looks like, once, for the two places that draw one.
 *
 * The host's panel (RoundTimerPanel) fills in a stepper, two alerts and a row
 * of buttons; the viewer's (live/LiveRoundTimer) fills in nothing at all and
 * gets the same countdown, the same TIME'S UP and the same flash. Everything
 * that makes it recognisable as one thing — the sheet, the header, the size of
 * the digits, the light-to-black switch, the strobe — is here rather than
 * written out twice and left to drift.
 *
 * Purely presentational: it holds no timer state, reads no store, and cannot
 * start or stop anything. Whoever mounts it decides when it is on screen.
 */

/** Light↔dark cycle every 500ms while alarming with Flash Screen on — a full
 *  cycle at 2Hz, comfortably under the ≤3-flashes/second threshold a
 *  full-screen high-contrast strobe needs to respect. Don't tighten this
 *  without checking that guidance again. */
const FLASH_INTERVAL_MS = 250;

/**
 * How far the sheet has to be pulled down before letting go closes it.
 *
 * Short enough that a real flick gets there, long enough that the nudge a thumb
 * gives the handle on the way to the START button does not. Anything under it
 * springs back, which is the answer to "did I just do something".
 */
const DISMISS_PX = 90;

const LIGHT = { bg: '#FFFFFF', ink: '#0D1F44', sub: '#6B7280', icon: '#007d88', handle: '#C4C8CF' };
const DARK = { bg: '#000000', ink: '#FFFFFF', sub: '#9CA3AF', icon: '#FFFFFF', handle: '#333333' };

interface Props {
  roundNumber: number;
  /** Reached zero and not yet silenced: TIME'S UP in place of the digits. */
  alarming: boolean;
  remainingMs: number;
  /**
   * White while there is still something to set, black once it is counting —
   * a phone left face-up at the net spends most of a round showing nothing but
   * four digits, and a near-black screen is the cheap way to do that.
   */
  light: boolean;
  /** Whether reaching zero should strobe the screen. */
  flashOn: boolean;
  onClose: () => void;
  /** The minutes stepper and the alerts. Absent on a read-only timer. */
  config?: ReactNode;
  /** START/STOP/RESET, and anything said under them. Absent on a read-only timer. */
  actions?: ReactNode;
}

export function TimerSheet({
  roundNumber,
  alarming,
  remainingMs,
  light,
  flashOn,
  onClose,
  config,
  actions,
}: Props) {
  // Off the bottom for the first frame, then let the transition carry it up —
  // the same two-step trick TourSheet uses. Mounted fresh each time it opens,
  // so there is nothing to reset on the way out.
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntering(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // The strobe: alternates the theme while alarming with Flash Screen on. The
  // reset lives in the cleanup rather than the effect body, so switching it off
  // never calls setState synchronously mid-effect.
  const [strobeLight, setStrobeLight] = useState(false);
  useEffect(() => {
    if (!alarming || !flashOn) return;
    const id = setInterval(() => setStrobeLight((v) => !v), FLASH_INTERVAL_MS);
    return () => {
      clearInterval(id);
      setStrobeLight(false);
    };
  }, [alarming, flashOn]);

  const theme = light || (alarming && flashOn && strobeLight) ? LIGHT : DARK;

  // How far the handle has been pulled down, in pixels. Null while nobody is
  // holding it, which is what hands the transform back to the entrance
  // animation's classes — an inline transform would otherwise pin the sheet
  // wherever the last drag left it.
  const [pulled, setPulled] = useState<number | null>(null);
  const from = useRef(0);

  function grab(e: PointerEvent<HTMLDivElement>) {
    // Captured, so the sheet keeps hearing the finger after it has slid off the
    // handle — which on a pull of any length it always has. Optional because
    // not every environment that can dispatch a pointer event implements it.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    from.current = e.clientY;
    setPulled(0);
  }

  function drag(e: PointerEvent<HTMLDivElement>) {
    if (pulled === null) return;
    // Downward only. A sheet already at the top of its travel has nowhere to go
    // up, and letting it stretch there makes the handle feel broken the other
    // way round.
    setPulled(Math.max(0, e.clientY - from.current));
  }

  function letGo() {
    if (pulled === null) return;
    const far = pulled >= DISMISS_PX;
    setPulled(null);
    if (far) onClose();
  }

  return (
    <div className="no-print fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close Round Timer"
        onClick={onClose}
        className="absolute inset-0 w-full cursor-default bg-black/40 transition-opacity duration-300"
        style={{ opacity: entering ? 1 : 0 }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Round Timer"
        // timer-sheet carries the height, in dvh with a vh fallback. See
        // index.css: 94vh on iOS Safari is measured against a screen with no
        // address bar on it, so the top of this sheet went up behind one.
        className={`sheet-panel timer-sheet relative flex flex-col rounded-t-3xl px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_40px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-out ${
          entering ? 'translate-y-0' : 'translate-y-full'
        }`}
        // background-color deliberately excluded from the transition: the
        // slide-up entrance only ever needs `transform` to animate, and letting
        // the theme swap ride the same transition would fade the strobe above
        // into a low-contrast grey mid-flash instead of a clean cut between
        // full black and full white.
        //
        // While the handle is held the transform is set here instead, and the
        // transition is off: a 300ms ease on every pointermove is a sheet that
        // lags a finger by a third of a second.
        style={{
          backgroundColor: theme.bg,
          transitionProperty: pulled === null ? 'transform' : 'none',
          ...(pulled === null ? {} : { transform: `translateY(${pulled}px)` }),
        }}
      >
        {/* The handle, and enough room around it to be caught by a thumb: the
            bar itself is six pixels tall, and a target that size is one nobody
            can hit. Pull it down past DISMISS_PX and letting go closes the
            timer; let go short of that and it springs back. It had been drawn
            here since the sheet existed and did nothing at all, which is worse
            than no handle — it says "pull me" and then ignores a pull.

            aria-hidden, and no keyboard role. Everything this does the Close
            button below already does, and a second control saying so would be
            two ways out of the sheet to read past. */}
        <div
          aria-hidden="true"
          onPointerDown={grab}
          onPointerMove={drag}
          onPointerUp={letGo}
          onPointerCancel={letGo}
          className="-mx-6 -mt-3 flex shrink-0 cursor-grab touch-none justify-center px-6 pb-2 pt-3 active:cursor-grabbing"
        >
          <div className="h-1.5 w-14 rounded-full" style={{ backgroundColor: theme.handle }} />
        </div>

        {/* The clock is the thing the round's header was tapped on, so it leads
            here too, centred over a title that names the round it belongs to.
            The close key is taken out of the flow rather than sat beside them,
            or it would shove both off centre.

            mt-8 clears the drag handle above, and then some. At mt-4 the glyph
            and the close key sat close enough to the top edge that iOS Safari's
            own furniture crowded them, and on an iPhone 11 the top of the clock
            was cut off outright. The height fix in index.css is the other half
            of that; this is the breathing room. */}
        <div className="relative mt-8 shrink-0 text-center" style={{ color: theme.icon }}>
          <TimerIcon className="mx-auto h-12 w-12" />
          <h2 className="mt-1 text-[1.6rem] font-extrabold" style={{ color: theme.ink }}>
            Round {roundNumber} Timer
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Round Timer"
            className="absolute -right-2 -top-1 rounded p-2 transition-colors"
            style={{ color: theme.sub }}
          >
            <CloseIcon className="h-8 w-8" strokeWidth={3} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto py-4">
          {alarming ? (
            <p
              className="text-center font-extrabold tracking-tight"
              style={{ color: theme.ink, fontSize: 'clamp(3rem, 13vw, 6.5rem)' }}
            >
              TIME&rsquo;S UP
            </p>
          ) : (
            <p
              className="text-center font-extrabold tabular-nums"
              style={{ color: theme.ink, fontSize: 'clamp(5rem, 26vw, 13rem)', lineHeight: 1 }}
            >
              {formatMMSS(remainingMs)}
            </p>
          )}
          {config}
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
