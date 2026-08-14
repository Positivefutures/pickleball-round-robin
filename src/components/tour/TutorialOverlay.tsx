import { useEffect, useRef, useState } from 'react';
import type { Region, TourView } from '../../lib/tour';
import { backCard, nextCard, noteScrolled, skipTour } from '../../lib/tour';
import {
  DIM,
  band,
  bubbleWidth,
  dimTiles,
  endAt,
  frameRects,
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
import { TourBar } from './TourBar';

function find(name: string): Element | null {
  return document.querySelector(`[data-tutorial="${name}"]`);
}

function rectOf(name: string): Rect | null {
  const el = find(name);
  return el ? toRect(el.getBoundingClientRect()) : null;
}

/** One region's box: its anchors padded, joined, and optionally cut short. */
function regionRect(region: Region): Rect | null {
  const parts = region.anchors.flatMap((a) => {
    const r = rectOf(a.name);
    return r ? [padRect(r, a.pad)] : [];
  });
  const joined = unionRect(parts);
  if (!joined || !region.endAt) return joined;
  const last = rectOf(region.endAt);
  return last ? endAt(joined, padRect(last)) : joined;
}

/**
 * What the tour draws.
 *
 * The screen darkened everywhere except the card's boxes, an orange ring on
 * each, a bubble beside each thing being named, and the button bar at the foot.
 * Every number comes out of tourGeometry.ts; this file measures, calls it, and
 * turns the answers into divs.
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
export function TutorialOverlay({ view }: { view: TourView }) {
  const bubbleEls = useRef<(HTMLDivElement | null)[]>([]);
  const [regions, setRegions] = useState<(Rect | null)[]>(() => view.regions.map(regionRect));
  const [anchors, setAnchors] = useState<(Rect | null)[]>(() =>
    view.bubbles.map((b) => (b.at ? rectOf(b.at) : null))
  );
  const [sizes, setSizes] = useState<(Rect | null)[]>([]);
  const [live, setLive] = useState<Rect | null>(() => (view.live ? rectOf(view.live) : null));

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
      setLive((prev) => {
        const next = view.live ? rectOf(view.live) : null;
        return sameRects([prev], [next]) ? prev : next;
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
      const boxes = view.regions.map(regionRect).filter((r): r is Rect => r !== null);
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

  // The one live control advances the card as well as doing its own job. A
  // capture listener rather than a wrapper, so the real button still gets its
  // own click and App is left with one way of moving the tab.
  useEffect(() => {
    const name = view.live;
    if (!name) return;
    const onClick = (e: MouseEvent) => {
      const el = find(name);
      if (el && e.target instanceof Node && el.contains(e.target)) nextCard();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [view.live]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const viewport: Rect = { top: 0, left: 0, width: vw, height: vh };
  const holes = regions.filter((r): r is Rect => r !== null);

  // Placement runs on whatever has been measured. A bubble with no size yet is
  // drawn off screen for one frame rather than in the wrong place.
  const width = bubbleWidth(vw);
  const placed: (Placed | null)[] = view.bubbles.map((b, i) => {
    const size = sizes[i];
    if (!size) return null;
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
    return placeBubble(at, { width, height: size.height }, { width: vw, height: vh }, b.prefer);
  });
  if (placed.length === 2 && placed[0] && placed[1]) {
    const [a, b] = resolveBubbles(placed[0], placed[1], { width: vw, height: vh });
    placed[0] = a;
    placed[1] = b;
  }

  return (
    <div className="no-print fixed inset-0 z-50" data-tutorial-overlay>
      {/* The screen minus the boxes, tiled so two boxes darken it exactly as
          much as one. Every tile swallows its clicks. */}
      {dimTiles(viewport, holes).map((t, i) => (
        <div
          key={`dim${i}`}
          className="pointer-events-auto fixed"
          style={{ ...t, backgroundColor: DIM }}
        />
      ))}

      {/* Inside a box the page is visible but still dead, except for the one
          control this card hands over. */}
      {holes.map((hole, i) => {
        const open = live && overlapping(hole, live) ? live : null;
        const shields = open ? frameRects(hole, open) : [hole];
        return shields.map((s, j) => (
          <div key={`shield${i}-${j}`} className="pointer-events-auto fixed" style={s} />
        ));
      })}

      {holes.map((hole, i) => (
        <div
          key={`ring${i}`}
          className="pointer-events-none fixed rounded-lg border-2 border-brand-orange"
          style={{ ...hole, boxShadow: '0 0 0 4px rgba(245, 71, 2, 0.18)' }}
        />
      ))}

      {view.banner && (
        <div className="pointer-events-none fixed inset-x-0 top-0 bg-brand-orange px-4 py-2.5 text-center text-base font-bold text-white shadow-md">
          {view.banner}
        </div>
      )}

      {view.bubbles.map((bubble, i) => {
        const at = placed[i];
        return (
          <div
            key={bubble.text}
            ref={(el) => {
              bubbleEls.current[i] = el;
            }}
            className="pointer-events-none fixed rounded-xl border-2 border-brand-orange bg-white px-4 py-3 text-base font-medium text-[#1F293D] shadow-xl"
            style={
              at
                ? { top: at.top, left: at.left, width }
                : { top: -9999, left: 0, width }
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
            {bubble.text}
          </div>
        );
      })}

      <TourBar
        onBack={backCard}
        onNext={nextCard}
        onSkip={skipTour}
        nextLabel={view.nextLabel ?? 'Next'}
        canBack={view.canBack}
        stepNumber={view.index + 1}
        stepCount={view.count}
      />
    </div>
  );
}

function overlapping(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}
