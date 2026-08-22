import { useCallback, useEffect, useRef, useState } from 'react';
import { ShareIcon, CloseIcon } from '../icons';
import { useScrollLock } from '../../hooks/useScrollLock';
import { LiveShareView } from './LiveShareView';

/**
 * Share Live Session, opened from a LIVE pill rather than from Actions.
 *
 * The card inside is the same component the Actions sheet shows — there is one
 * LiveShareView and both routes mount it — so the QR code, the two switches, the
 * tiles and the fine print cannot drift apart. What differs is the way out, and
 * that is the whole reason this file exists: the sheet in Actions came from a
 * grid of cards and offers a chevron back to it, and there is nothing behind
 * this one to go back to. So it carries the close cross alone.
 *
 * The sheet mechanics below are ActionsSheet's, cut down to one view: no card
 * grid, no done flash, no measured height. It is deliberately not an extra mode
 * on that component. ActionsSheet needs a schedule, a roster and eleven
 * callbacks before it will render, and a live share outlives all three — a host
 * can share three groups tonight, walk back to Setup on any of them, and the
 * pill is still there with no schedule underneath it.
 */

const SHEET_FRACTION = 0.92;
const SLIDE_MS = 300;
const DRAG_TO_CLOSE = 80;

const NAVY_TEXT = '#1B2A41';
const QUIET_TEXT = '#636A77';
/** The orange the Share Session card wears in the Actions grid. */
const ORANGE = 'var(--color-brand-orange)';

interface Props {
  onClose: () => void;
  /** Shuts the panel and opens My Account, for a host who has not signed in. */
  onOpenAccount?: () => void;
}

export function LiveSharePanel({ onClose, onOpenAccount }: Props) {
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  useScrollLock(true);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const requestClose = useCallback(() => {
    setClosing(true);
    timers.current.push(window.setTimeout(onClose, SLIDE_MS));
  }, [onClose]);

  // Slide in on the frame after mount, so the browser has a "from" to animate.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  /** Dragging the header down closes the sheet. Bound to the header alone. */
  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragFrom.current = e.clientY;
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (dragFrom.current === null) return;
      const dy = Math.max(0, e.clientY - dragFrom.current);
      if (!dragging && dy < 4) return;
      if (!dragging) {
        setDragging(true);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      setDragY(dy);
    },
    onPointerUp: () => {
      if (dragFrom.current === null) return;
      dragFrom.current = null;
      setDragging(false);
      if (dragY > DRAG_TO_CLOSE) requestClose();
      setDragY(0);
    },
  };

  const offset = closing || !shown ? '100%' : `${dragY}px`;

  return (
    <div className="no-print fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close Share Live Session"
        onClick={requestClose}
        className="absolute inset-0 w-full cursor-default bg-black/40 transition-opacity duration-300"
        style={{ opacity: closing || !shown ? 0 : 1 }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share Live Session"
        className="sheet-panel absolute inset-x-0 bottom-0 flex flex-col overflow-hidden
                   rounded-t-2xl bg-white shadow-[0_-6px_24px_rgba(0,0,0,0.18)]"
        style={{
          height: `${Math.round(window.innerHeight * SHEET_FRACTION)}px`,
          maxHeight: `${SHEET_FRACTION * 100}vh`,
          transform: `translateY(${offset})`,
          transition: dragging ? 'none' : `transform ${SLIDE_MS}ms ease-out`,
        }}
      >
        {/* No drag handle drawn, the same as every actions panel since 3.74:
            the gesture stays, the furniture announcing it does not. */}
        <header {...dragHandlers} className="shrink-0 touch-none select-none px-6 pb-2 pt-5">
          {/* No back chevron. The left of this header is deliberately empty —
              this panel was opened from a pill, and closing it is the only way
              out there is. */}
          <div className="relative">
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close Share Live Session"
              className="absolute -mr-2 right-0 top-0 rounded p-1 text-[#626D7E] transition-colors hover:bg-gray-100"
            >
              <CloseIcon className="h-[29px] w-[29px]" strokeWidth={3} />
            </button>
            <div className="flex flex-col items-center px-10 text-center">
              <span className="flex items-center justify-center" style={{ color: ORANGE }}>
                <ShareIcon className="h-14 w-14" />
              </span>
              <h2
                className="mt-2 text-2xl font-extrabold leading-tight"
                style={{ color: NAVY_TEXT }}
              >
                Share Live Session
              </h2>
              <p className="mt-1 text-sm" style={{ color: QUIET_TEXT }}>
                Let others see the schedule, with live updates, on their phone.
              </p>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          <LiveShareView onCreateAccount={onOpenAccount} />
        </div>
      </div>
    </div>
  );
}
