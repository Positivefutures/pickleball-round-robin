import { useEffect, useRef, useState } from 'react';
import type { Region, TourView } from '../../lib/tour';
import { backCard, noteScrolled, skipTour } from '../../lib/tour';
import {
  DIM,
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
 * Whether one of the app's own panels has taken the screen.
 *
 * The tour cannot get out of its way with a z-index. It is mounted outside
 * `.app-panel`, which it has to be — that element takes a transform when the
 * settings drawer slides, and a transformed ancestor becomes the containing
 * block for its fixed children, which would carry the spotlight off screen with
 * it. But `.app-panel` also carries `z-10`, so every panel inside it, however
 * high it sets its own z-index, is stacked inside that one context and the
 * overlay sitting outside at z-40 comes out over the lot.
 *
 * So it stands down instead. Two cards hand over a control that opens a panel —
 * the group name on card 1, the court number on card 5 — and while either is up
 * the tour draws nothing at all and takes none of the clicks. It is back the
 * frame after the panel closes, on the same card.
 */
function panelOpen(): boolean {
  return document.querySelector('[data-tour-suspends]') !== null;
}

/**
 * What the tour draws.
 *
 * The screen darkened everywhere except the card's boxes, an orange ring on the
 * ones being pointed at, a bubble beside each with the step's own buttons in it,
 * and clicks stopped everywhere the card has not left something alive. Every
 * number comes out of tourGeometry.ts; this file measures, calls it, and turns
 * the answers into divs.
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
export function TutorialOverlay({ view, onNext }: { view: TourView; onNext: () => void }) {
  const bubbleEls = useRef<(HTMLDivElement | null)[]>([]);
  const [suspended, setSuspended] = useState(panelOpen);
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
      setSuspended((prev) => {
        const next = panelOpen();
        return prev === next ? prev : next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [view]);

  // Bring this card's boxes into view, by the smallest scroll that does it, on
  // the one frame before App takes the lock. A pinned body cannot be scrolled.
  const scrolledFor = useRef(-1);
  useEffect(() => {
    if (!view.scrolling) return;
    if (scrolledFor.current === view.index) {
      noteScrolled();
      return;
    }
    const frame = requestAnimationFrame(() => {
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
      scrolledFor.current = view.index;
      noteScrolled();
    });
    return () => cancelAnimationFrame(frame);
  }, [view.scrolling, view.index, view.regions]);

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

  // Placement runs on whatever has been measured. A bubble with no size yet is
  // drawn off screen for one frame rather than in the wrong place.
  const placed: (Placed | null)[] = view.bubbles.map((b, i) => {
    const size = sizes[i];
    if (!size) return null;
    const width = bubbleWidth(vw, b.maxWidth);
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
    return placeBubble(at, { width, height: size.height }, screen, b.prefer);
  });
  if (placed.length === 2 && placed[0] && placed[1]) {
    const [a, b] = resolveBubbles(placed[0], placed[1], screen);
    placed[0] = a;
    placed[1] = b;
  }

  // Out of the way entirely while one of the app's own panels is up. Nothing
  // drawn and nothing intercepted, so the panel behaves exactly as it does
  // outside the tour. Below the hooks, never above them.
  if (suspended) return null;

  return (
    // pointer-events-none, and not optional. Children paint above their parent,
    // so the shields below work either way — but over a hole the card has left
    // live there is no child, and a root that took its own pointer events would
    // be the hit target there and swallow the one click the card is waiting for.
    <div
      className="no-print pointer-events-none fixed inset-0 z-40"
      data-tutorial-overlay
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
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[1.125rem] leading-none text-gray-400">
                <span>
                  Step {view.index + 1} of {view.count}
                </span>
                {/* Quiet on purpose. It is the way out for somebody who already
                    knows the app, and it must never look like the thing to tap. */}
                <button
                  type="button"
                  onClick={skipTour}
                  className="font-medium underline underline-offset-2 transition-colors hover:text-gray-600"
                >
                  Skip
                </button>
              </div>
            )}

            {bubble.text}

            {controls && (view.canBack || !view.hideNext) && (
              <div className="mt-2 flex items-center justify-end gap-5">
                {/* Absent, not disabled, where there is nowhere to go back to.
                    A greyed button invites a tap that does nothing. */}
                {view.canBack && (
                  <button
                    type="button"
                    onClick={backCard}
                    className="font-semibold text-gray-500 underline underline-offset-2 transition-colors hover:text-gray-700"
                  >
                    Back
                  </button>
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
    </div>
  );
}
