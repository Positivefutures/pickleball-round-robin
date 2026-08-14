import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Region, TourView } from '../../lib/tour';
import { noteScrolled, skipTour } from '../../lib/tour';
import { subscribeSuspend, tourSuspended } from '../../lib/tourSuspend';
import {
  DIM,
  EDGE,
  band,
  bubbleWidth,
  dimTiles,
  endAt,
  minimalScroll,
  padRect,
  placeBubble,
  resolveBubbles,
  sameRects,
  toRect,
  unionRect,
  type Placed,
  type Rect,
} from '../../lib/tourGeometry';

function find(name: string): Element | null {
  return document.querySelector(`[data-tutorial="${name}"]`);
}

function rectOf(name: string): Rect | null {
  const el = find(name);
  return el ? toRect(el.getBoundingClientRect()) : null;
}

/**
 * One region's box: its anchors padded, joined, and optionally cut short.
 *
 * A plain region takes no padding at all. It is not a spotlight, it is a piece
 * of the page being left alone, and eight pixels of undimmed air around the live
 * tab would read as a halo nobody asked for.
 */
function regionRect(region: Region): Rect | null {
  const parts = region.anchors.flatMap((a) => {
    const r = rectOf(a.name);
    if (!r) return [];
    return [region.plain ? r : padRect(r, a.pad)];
  });
  const joined = unionRect(parts);
  if (!joined || !region.endAt) return joined;
  const last = rectOf(region.endAt);
  return last ? endAt(joined, padRect(last)) : joined;
}

/**
 * What the tour draws.
 *
 * The screen darkened everywhere except the card's boxes, an orange ring on the
 * ones being pointed at, a bubble beside each with the step's own Back and Next
 * in it, Skip tutorial at the foot of the screen throughout, and clicks stopped
 * everywhere the card has not left something alive. Every number comes out of
 * tourGeometry.ts; this file measures, calls it, and turns the answers into divs.
 *
 * Geometry is re-read on a requestAnimationFrame loop rather than from scroll
 * and resize listeners. A card watches up to four anchors, the page moves for
 * reasons no listener reports — a font swapping in, an image landing, Safari's
 * URL bar collapsing — and the identity guard means a settled screen costs four
 * measurements a frame and no re-render at all.
 *
 * It takes no scroll lock of its own. App holds one aggregated lock for the
 * whole app, because the body is pinned with position:fixed and a second lock
 * taken over the first reads the scroll offset as zero.
 */
export function TutorialOverlay({
  view,
  onNext,
  onBack,
}: {
  view: TourView;
  onNext: () => void;
  // Both come from App, not from the store directly. A card may have something
  // of the app's to set on the way through, and only App can set it.
  onBack: () => void;
}) {
  const bubbleEls = useRef<(HTMLDivElement | null)[]>([]);
  // Out of the way while one of the app's own panels is up. Subscribed rather
  // than polled on the measure loop below, so the panel appearing and the tour
  // disappearing are the same commit and no frame is painted between them. See
  // lib/tourSuspend.
  const suspended = useSyncExternalStore(subscribeSuspend, tourSuspended, tourSuspended);
  // Whether Skip tutorial has been pressed and is waiting to be meant. It is a
  // small target at the foot of a screen full of things the card wants pressed,
  // and ending the tour by accident cannot be undone.
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [regions, setRegions] = useState<(Rect | null)[]>(() => view.regions.map(regionRect));
  const [anchors, setAnchors] = useState<(Rect | null)[]>(() =>
    view.bubbles.map((b) => (b.at ? rectOf(b.at) : null))
  );
  const [sizes, setSizes] = useState<(Rect | null)[]>([]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setRegions((prev) => {
        const next = view.regions.map(regionRect);
        return sameRects(prev, next) ? prev : next;
      });
      setAnchors((prev) => {
        const next = view.bubbles.map((b) => (b.at ? rectOf(b.at) : null));
        return sameRects(prev, next) ? prev : next;
      });
      setSizes((prev) => {
        const next = view.bubbles.map((_, i) => {
          const el = bubbleEls.current[i];
          return el ? toRect(el.getBoundingClientRect()) : null;
        });
        return sameRects(prev, next) ? prev : next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [view]);

  // Put the page where this card needs it, on the one frame before App takes
  // the lock. A pinned body cannot be scrolled.
  //
  // Every arrival at a card scrolls, not just the first. Cards are walked
  // backwards as well as forwards, and a card returned to by Back is being
  // returned to from a page the card after it scrolled somewhere else — so
  // remembering which cards had already been placed left Back showing a bubble
  // with none of its controls under it.
  useEffect(() => {
    if (!view.scrolling) return;
    const frame = requestAnimationFrame(() => {
      if (view.scroll === 'top') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      } else {
        const boxes = view.regions
          .filter((r) => !r.plain)
          .map(regionRect)
          .filter((r): r is Rect => r !== null);
        const whole = unionRect(boxes);
        if (whole) {
          const { top, bottom } = band(window.innerHeight);
          const by = minimalScroll(whole, top, bottom);
          // Never smooth: it would settle over three hundred milliseconds with
          // the measure loop chasing it and the lock waiting behind.
          if (by !== 0) window.scrollBy({ top: by, behavior: 'auto' });
        }
      }
      noteScrolled();
    });
    return () => cancelAnimationFrame(frame);
  }, [view.scrolling, view.index, view.regions, view.scroll]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const viewport: Rect = { top: 0, left: 0, width: vw, height: vh };

  const screen = { width: vw, height: vh };

  const boxes = view.regions.map((region, i) => ({ region, rect: regions[i] }));
  const holes = boxes.flatMap(({ rect }) => (rect ? [rect] : []));
  const rings = boxes.flatMap(({ region, rect }) => (rect && !region.plain ? [rect] : []));

  // Inside a box the page shows through, and by default it is still dead. The
  // card's live controls are subtracted from the shields with the same grid
  // sweep that subtracts the boxes from the darkness — one hole, several holes
  // or a control lying half outside its own box all come out right, and it is
  // the function with the tests on it.
  const liveRects = (view.live ?? []).flatMap((name) => {
    const r = rectOf(name);
    return r ? [r] : [];
  });
  const shields = holes.flatMap((hole) => dimTiles(hole, liveRects));

  // The left edge of something a bubble has been told to stop short of, read
  // live like the live rects above. Zero-width means it has not laid out yet,
  // and capping a bubble on that would squeeze it to the floor for a frame.
  const stopBefore = (name?: string): number | undefined => {
    if (!name) return undefined;
    const r = rectOf(name);
    return r && r.width > 0 ? r.left : undefined;
  };

  // Placement runs on whatever has been measured. A bubble with no size yet is
  // drawn off screen for one frame rather than in the wrong place.
  const placed: (Placed | null)[] = view.bubbles.map((b, i) => {
    const size = sizes[i];
    if (!size) return null;
    const width = bubbleWidth(vw, b.maxWidth, stopBefore(b.clearOf));
    const at = anchors[i];
    if (!at) {
      return {
        top: Math.max(band(vh).top, (vh - size.height) / 2 - 40),
        left: (vw - width) / 2,
        width,
        height: size.height,
        pointerX: -100,
        side: 'below' as const,
      };
    }
    return placeBubble(at, { width, height: size.height }, screen, b.prefer, b.align);
  });
  if (placed.length === 2 && placed[0] && placed[1]) {
    const [a, b] = resolveBubbles(placed[0], placed[1], screen);
    placed[0] = a;
    placed[1] = b;
  }

  return (
    // pointer-events-none, and not optional. Children paint above their parent,
    // so the shields below work either way — but over a hole the card has left
    // live there is no child, and a root that took its own pointer events would
    // be the hit target there and swallow the one click the card is waiting for.
    //
    // Hidden rather than unmounted while a panel is up. Nothing is drawn and
    // nothing is hit — visibility:hidden takes both, and every child inherits
    // it — but the bubbles keep their measured heights, so the tour comes back
    // in one piece instead of laying itself out again in front of the host.
    <div
      className="no-print pointer-events-none fixed inset-0 z-40"
      style={suspended ? { visibility: 'hidden' } : undefined}
      data-tutorial-overlay
      data-tour-hidden={suspended ? '' : undefined}
    >
      {/* The screen minus the boxes, tiled so two boxes darken it exactly as
          much as one. Every tile swallows its clicks. */}
      {dimTiles(viewport, holes).map((t, i) => (
        <div
          key={`dim${i}`}
          className="pointer-events-auto fixed"
          style={{ ...t, backgroundColor: DIM }}
        />
      ))}

      {shields.map((s, i) => (
        <div key={`shield${i}`} className="pointer-events-auto fixed" style={s} />
      ))}

      {rings.map((hole, i) => (
        <div
          key={`ring${i}`}
          // Named so a test can count them. The rings say what the card is
          // about, and one drawn round the live step tab would be the tour
          // pointing at the tab the host is already standing on.
          data-tour-ring
          className="pointer-events-none fixed rounded-lg border-2 border-brand-orange"
          style={{ ...hole, boxShadow: '0 0 0 4px rgba(245, 71, 2, 0.18)' }}
        />
      ))}

      {view.bubbles.map((bubble, i) => {
        const at = placed[i];
        // The buttons ride in the last bubble. Two bubbles cannot both carry
        // them, and the second one is the one being asked to act on.
        const controls = i === view.bubbles.length - 1;
        return (
          <div
            key={bubble.text}
            ref={(el) => {
              bubbleEls.current[i] = el;
            }}
            className="pointer-events-auto fixed rounded-xl border-2 border-brand-orange bg-white px-4 py-3 text-base font-medium text-[#1F293D] shadow-xl"
            style={
              at
                ? { top: at.top, left: at.left, width: at.width }
                : { top: -9999, left: 0, width: bubbleWidth(vw, bubble.maxWidth) }
            }
          >
            {at && at.pointerX >= 0 && (
              <span
                aria-hidden="true"
                className="absolute h-3 w-3 rotate-45 border-brand-orange bg-white"
                style={
                  at.side === 'below'
                    ? { left: at.pointerX - 6, top: -7, borderLeftWidth: 2, borderTopWidth: 2 }
                    : { left: at.pointerX - 6, bottom: -7, borderRightWidth: 2, borderBottomWidth: 2 }
                }
              />
            )}

            {controls && (
              <div className="mb-1.5 text-[1.125rem] leading-none text-gray-400">
                Step {view.index + 1} of {view.count}
              </div>
            )}

            {bubble.text}

            {controls && (view.canBack || !view.hideNext) && (
              // Back at the left margin, Next at the right, and the row keeps
              // that shape with only one of them in it: they are opposite
              // directions, and a Next that slides left when Back disappears
              // moves the one button that is always in the same place.
              <div className="mt-2 flex items-center justify-between gap-5">
                {/* Absent, not disabled, where there is nowhere to go back to.
                    A greyed button invites a tap that does nothing. */}
                {view.canBack ? (
                  <button
                    type="button"
                    onClick={onBack}
                    className="font-semibold text-gray-500 underline underline-offset-2 transition-colors hover:text-gray-700"
                  >
                    Back
                  </button>
                ) : (
                  <span />
                )}
                {!view.hideNext && (
                  <button
                    type="button"
                    onClick={onNext}
                    className="font-bold text-brand-teal underline underline-offset-2 transition-colors hover:text-brand-teal-dark"
                  >
                    Next
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Skip tutorial, in the same place on every card, at the foot of the
          screen the band is kept clear of. In the corner of a bubble it read as
          one of that card's two buttons; down here it is plainly about the tour
          rather than about the step, and no card has to find room for it. */}
      <button
        type="button"
        onClick={() => setConfirmSkip(true)}
        data-tour-skip
        className="pointer-events-auto fixed left-1/2 -translate-x-1/2 rounded-md border border-brand-orange bg-brand-orange-light px-4 py-1 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-white"
        style={{ bottom: EDGE }}
      >
        Skip tutorial
      </button>

      {/* Asked, because the pill sits at the foot of a screen full of things
          the card wants pressed and there is no way back into a tour that has
          been ended. Last in the tree and over its own scrim, so the card
          underneath is quiet and none of its live controls can be reached
          while the question is open. */}
      {confirmSkip && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="End the tutorial?"
          className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-sm rounded-lg border border-[#ddd] bg-white p-6 shadow-xl">
            <p className="text-center text-xl font-extrabold text-[#051829]">
              End the tutorial?
            </p>
            <p className="mt-2 text-center text-sm text-gray-600">
              Nothing you have made is lost. You can carry on from here.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmSkip(false)}
                className="flex-1 rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
              >
                Keep Going
              </button>
              <button
                type="button"
                onClick={skipTour}
                className="flex-1 rounded-md bg-brand-orange px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-orange-dark"
              >
                End Tutorial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
