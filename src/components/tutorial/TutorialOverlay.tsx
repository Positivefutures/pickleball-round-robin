import { useEffect, useState } from 'react';
import type { TutorialView } from '../../lib/tutorial';
import { advanceTutorial, stopTutorial, noteTutorialTyping } from '../../lib/tutorial';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Breathing room between the spotlit element and the darkness. */
const PAD = 8;

function measure(anchor: string | null): Rect | null {
  if (!anchor) return null;
  const el = document.querySelector(`[data-tutorial="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/**
 * What the tutorial engine decides, drawn: the screen darkened by four
 * rectangles around a hole over the current target, a ring on the hole, an
 * arrow, and the instruction card. The hole is a hole — clicks there land on
 * the real control, and the dark rectangles swallow everything else.
 *
 * Geometry comes from a requestAnimationFrame loop rather than listeners
 * alone: the page scrolls, dialogs slide, the keyboard opens. Re-measuring
 * every frame while the tour runs is cheap, and it never goes stale. Under
 * happy-dom every rect is zero and none of it matters — advancement is driven
 * by state, not by where things are painted.
 *
 * Deliberately no useScrollLock: several of the spotlit dialogs hold the body
 * lock themselves, and two concurrent locks fight over the scroll offset (see
 * the note in RosterPage).
 */
export function TutorialOverlay({ view }: { view: TutorialView }) {
  const [hole, setHole] = useState<Rect | null>(() => measure(view.anchor));
  const [arrowAt, setArrowAt] = useState<Rect | null>(() => measure(view.arrow));

  // Bring the target into view when the spotlight moves to it.
  useEffect(() => {
    if (!view.anchor) return;
    const el = document.querySelector(`[data-tutorial="${view.anchor}"]`) as HTMLElement | null;
    el?.scrollIntoView?.({ block: 'center' });
  }, [view.anchor]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setHole((prev) => {
        const next = measure(view.anchor);
        return sameRect(prev, next) ? prev : next;
      });
      setArrowAt((prev) => {
        const next = measure(view.arrow);
        return sameRect(prev, next) ? prev : next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [view.anchor, view.arrow]);

  // The arrow steps aside once the name field is being typed in. Watched here
  // rather than in PlayerForm so no component has to know the tour exists.
  useEffect(() => {
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (t?.getAttribute?.('data-tutorial') === 'player-name-input' && t.value) {
        noteTutorialTyping();
      }
    };
    document.addEventListener('input', onInput, true);
    return () => document.removeEventListener('input', onInput, true);
  }, []);

  const dark = 'fixed bg-black/60';
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  const top = hole ? Math.max(0, hole.top - PAD) : 0;
  const left = hole ? Math.max(0, hole.left - PAD) : 0;
  const right = hole ? Math.min(vw, hole.left + hole.width + PAD) : 0;
  const bottom = hole ? Math.min(vh, hole.top + hole.height + PAD) : 0;

  // The card sits under the hole when there is room, above it when there is
  // not, over the hole's foot when the hole is taller than the screen leaves
  // room for either, and in the middle when there is no hole at all.
  const roomBelow = vh - bottom;
  const cardStyle: React.CSSProperties = hole
    ? roomBelow > 220
      ? { top: bottom + 16 }
      : top > 220
        ? { bottom: vh - top + 16 }
        : { bottom: 16 }
    : { top: '50%', transform: 'translate(-50%, -50%)' };

  // Above the target pointing down, unless the target is at the very top.
  // Gated on the view as well as the measurement, so the arrow goes down the
  // moment the engine lowers it rather than a frame later.
  const arrowAbove = arrowAt !== null && arrowAt.top >= 64;
  const arrowStyle: React.CSSProperties | null =
    view.arrow !== null && arrowAt !== null
      ? {
          left: arrowAt.left + arrowAt.width / 2 - 14,
          top: arrowAbove ? arrowAt.top - 44 : arrowAt.top + arrowAt.height + 8,
        }
      : null;

  return (
    <div className="no-print fixed inset-0 z-50 pointer-events-none" data-tutorial-overlay>
      {hole ? (
        <>
          <div className={`${dark} pointer-events-auto`} style={{ top: 0, left: 0, right: 0, height: top }} />
          <div className={`${dark} pointer-events-auto`} style={{ top, left: 0, width: left, height: bottom - top }} />
          <div className={`${dark} pointer-events-auto`} style={{ top, left: right, right: 0, height: bottom - top }} />
          <div className={`${dark} pointer-events-auto`} style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
          <div
            className="fixed rounded-lg border-2 border-brand-orange"
            style={{ top, left, width: right - left, height: bottom - top }}
          />
        </>
      ) : (
        <div className={`${dark} pointer-events-auto inset-0`} />
      )}

      {arrowStyle && (
        <svg
          className="tutorial-arrow fixed"
          style={arrowStyle}
          width="28"
          height="36"
          viewBox="0 0 28 36"
          aria-hidden="true"
        >
          <path
            d={
              arrowAbove
                ? 'M14 2 v22 M4 16 l10 10 10-10'
                : 'M14 34 v-22 M4 20 l10-10 10 10'
            }
            fill="none"
            stroke="var(--color-brand-orange)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <div
        className="pointer-events-auto fixed left-1/2 -translate-x-1/2 w-[min(22rem,calc(100vw-2rem))] bg-white rounded-lg border-[3px] border-[#444] shadow-lg p-4"
        style={cardStyle}
        role="dialog"
        aria-label="Tutorial"
      >
        <div className="text-xs font-medium text-gray-400">
          Step {view.stepNumber} of {view.stepCount}
        </div>
        <h3 className="mt-1 text-lg font-bold text-gray-800">{view.title}</h3>
        <p className="mt-1 text-sm text-gray-600">{view.body}</p>
        {view.error && <p className="mt-2 text-sm font-medium text-red-600">{view.error}</p>}
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={stopTutorial}
            className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
          >
            Stop tutorial
          </button>
          {view.advanceLabel && (
            <button
              onClick={advanceTutorial}
              className="px-4 py-2 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-medium"
            >
              {view.advanceLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
