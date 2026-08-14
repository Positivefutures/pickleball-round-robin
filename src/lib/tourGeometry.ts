/**
 * Where the first-run tour draws everything, as arithmetic.
 *
 * Not a line of DOM in here, on purpose. The tour is almost entirely a
 * geometry problem — a hole in a dark screen, a ring, a bubble that has to
 * find room — and the test environment (happy-dom) has no layout engine, so
 * every rect it reports is zero. Keeping the maths in a pure module is what
 * makes it testable at all: the numbers get real assertions here, and the
 * overlay component is left with nothing harder than calling
 * getBoundingClientRect and passing the answers on.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** Breathing room between a spotlit element and the darkness around it. */
export const PAD = 8;

/** Inset from the edge of the screen for anything the tour draws. */
export const EDGE = 16;

/** The widest a bubble is ever drawn, before its own cap or the screen. */
export const BUBBLE_MAX = 336;

/** Between a bubble and what it points at, and between two bubbles. */
export const GAP = 10;

/**
 * Room kept clear along the foot of the screen for the Skip button.
 *
 * Skip used to ride in the corner of the bubble, where it sat beside the step
 * count and read as one of the card's two buttons. It is neither: it is the way
 * out of the whole tour, and it belongs somewhere fixed that no card owns. The
 * price is a strip along the bottom that nothing else may be placed in. The old
 * Back/Next bar cost 108px; this costs 40.
 */
export const FOOT = 40;

/**
 * How dark the screen goes outside the spotlight.
 *
 * Lighter than the app's own modal scrim, which is `bg-black/40`, and
 * deliberately: a modal means "deal with me first" and blocks what is behind
 * it, while this means "look here", and what is behind it is the thing being
 * looked at. Much below 0.3 and the highlight stops reading as a highlight;
 * much above 0.45 and the page reads as disabled rather than quietened.
 */
export const DIM = 'rgba(0, 0, 0, 0.35)';

const right = (r: Rect) => r.left + r.width;
const bottom = (r: Rect) => r.top + r.height;

/** Turns a DOMRect into ours, dropping the parts nothing here uses. */
export function toRect(r: { top: number; left: number; width: number; height: number }): Rect {
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/** For the measure loop, which compares whole lists of rects every frame. */
export function sameRects(a: (Rect | null)[], b: (Rect | null)[]): boolean {
  return a.length === b.length && a.every((r, i) => sameRect(r, b[i]));
}

/**
 * One element's rect, grown by the standard padding plus anything extra it
 * asked for.
 *
 * The extras exist for the Actions button, whose four icon tiles are absolutely
 * positioned at `-top-[17px]` and so contribute nothing to its border box. A
 * box drawn on the measurement alone slices their heads off. Growing that one
 * anchor upward is the fix; growing every box to suit it is not.
 */
export function padRect(r: Rect, pad?: Partial<Record<Side, number>>): Rect {
  const t = PAD + (pad?.top ?? 0);
  const b = PAD + (pad?.bottom ?? 0);
  const l = PAD + (pad?.left ?? 0);
  const rt = PAD + (pad?.right ?? 0);
  return { top: r.top - t, left: r.left - l, width: r.width + l + rt, height: r.height + t + b };
}

/** The smallest rect holding all of them, or null if there are none. */
export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  return {
    top,
    left,
    width: Math.max(...rects.map(right)) - left,
    height: Math.max(...rects.map(bottom)) - top,
  };
}

/**
 * The union, cut off at the foot of one of its parts.
 *
 * For the card that boxes Round 1 from its heading down to below Court 1. The
 * round's panel runs on past Court 1 to the other courts and the sit-out list,
 * and taking the plain union would box the lot — on a phone that is most of the
 * page, which is not a highlight.
 */
export function endAt(union: Rect, last: Rect): Rect {
  return { ...union, height: Math.max(0, bottom(last) - union.top) };
}

/** Whether `c` sits entirely inside `h`. */
function contains(h: Rect, c: Rect): boolean {
  return c.left >= h.left && c.top >= h.top && right(c) <= right(h) && bottom(c) <= bottom(h);
}

function clipTo(view: Rect, r: Rect): Rect {
  const left = Math.max(view.left, r.left);
  const top = Math.max(view.top, r.top);
  return {
    top,
    left,
    width: Math.min(right(view), right(r)) - left,
    height: Math.min(bottom(view), bottom(r)) - top,
  };
}

/**
 * The screen minus the holes, as rectangles that do not overlap.
 *
 * The old tour drew its darkness as four rects around one hole, which is neat
 * and cannot be made to work for two: cover the screen twice and the overlap
 * goes twice as dark, which draws the eye to the wrong place entirely. This
 * sweeps a grid instead. Every hole edge becomes a grid line, so each cell of
 * the grid is either wholly inside a hole or wholly outside every one of them,
 * and emitting the outside cells covers the complement exactly once. Two holes
 * therefore darken the screen to precisely the value one hole does.
 *
 * At most (2n+1)² cells, so with the two holes the tour ever asks for it is
 * twenty-five in the worst case and eight or so in practice.
 */
export function dimTiles(view: Rect, holes: Rect[]): Rect[] {
  const live = holes
    .map((h) => clipTo(view, h))
    .filter((h) => h.width > 0 && h.height > 0);
  if (live.length === 0) return [view];

  const xs = [...new Set([view.left, right(view), ...live.flatMap((h) => [h.left, right(h)])])].sort(
    (a, b) => a - b
  );
  const ys = [...new Set([view.top, bottom(view), ...live.flatMap((h) => [h.top, bottom(h)])])].sort(
    (a, b) => a - b
  );

  const tiles: Rect[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cell = {
        left: xs[i],
        top: ys[j],
        width: xs[i + 1] - xs[i],
        height: ys[j + 1] - ys[j],
      };
      if (cell.width <= 0 || cell.height <= 0) continue;
      if (live.some((h) => contains(h, cell))) continue;
      tiles.push(cell);
    }
  }
  return tiles;
}

/** Narrow enough to be a nuisance; anything under this is not worth reading. */
export const BUBBLE_MIN = 120;

/**
 * The width a bubble gets: 21rem, or the screen less its margins, or whatever
 * narrower width the card asked for.
 *
 * A card asks when something beside the bubble has to stay readable — the one on
 * the Players tab sits over "Add Players" and the rating and gender columns at
 * full width, and the point of that card is that they can see their group.
 *
 * `stopBefore` is the left edge of something the bubble must not reach, and it
 * is a measurement rather than a number somebody chose. The Select Players card
 * sits level with Generate Schedule, and the room left over is whatever the
 * screen and that button's own width leave: 148px on a 390 phone and 133 on a
 * 375 one. Picking a constant that suited one of those would quietly cover the
 * button on the other, which is the whole thing this card must not do.
 */
export function bubbleWidth(viewWidth: number, max = BUBBLE_MAX, stopBefore?: number): number {
  const wide = Math.min(max, BUBBLE_MAX, viewWidth - 2 * EDGE);
  if (stopBefore === undefined) return wide;
  // Floored, because a bubble squeezed to nothing helps nobody. If it ever
  // comes to that the card is wrong, not the arithmetic.
  return Math.min(wide, Math.max(BUBBLE_MIN, stopBefore - EDGE - GAP));
}

/** The screen a bubble is being placed on, and what it must stay clear of. */
export interface View {
  width: number;
  height: number;
  /** Nothing is placed above this. The foot of the step tabs. */
  keepTop?: number;
}

export interface Placed extends Rect {
  /** Where the pointer sits along the bubble's own width. */
  pointerX: number;
  side: 'above' | 'below';
}

/**
 * The vertical strip a bubble is allowed to occupy.
 *
 * The whole screen less its margins and the strip along the foot that Skip
 * sits in. The old Back/Next bar owned 108px of every card, and the two cards
 * that point at the bottom of a long page were the ones paying for it.
 *
 * `keepTop` is the other thing reservable: the step tabs. The tour goes to the
 * trouble of leaving the live tab undimmed on every card, and a bubble parked
 * across it undoes that.
 */
export function band(viewHeight: number, keepTop = 0): { top: number; bottom: number } {
  return { top: Math.max(EDGE, keepTop), bottom: viewHeight - EDGE - FOOT };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * A bubble beside the thing it points at.
 *
 * Below by default, above when there is no room below, and clamped into the
 * band either way — the bar at the foot is not a collision to be resolved, it
 * is a floor the bubble is never placed under in the first place.
 *
 * The pointer is worked out after the clamping rather than before. On a 390px
 * screen a bubble is 336px wide and almost every anchor is off centre, so the
 * bubble has usually been pushed sideways to fit; a pointer drawn at its middle
 * would then be aiming at nothing.
 *
 * `align: 'left'` gives up on centring and pins the bubble to the left margin.
 * It is for the card whose anchor is a full-width panel with a live button
 * beside the bubble rather than under it: centred, a narrow bubble lands in the
 * middle of the row and covers exactly the thing it must not.
 */
export function placeBubble(
  anchor: Rect,
  size: { width: number; height: number },
  view: View,
  prefer: 'above' | 'below' = 'below',
  align?: 'left'
): Placed {
  const { top: bandTop, bottom: bandBottom } = band(view.height, view.keepTop);
  const roomBelow = bandBottom - bottom(anchor) - GAP;
  const roomAbove = anchor.top - GAP - bandTop;

  const fitsBelow = roomBelow >= size.height;
  const fitsAbove = roomAbove >= size.height;
  const side: 'above' | 'below' =
    prefer === 'below'
      ? fitsBelow || !fitsAbove
        ? 'below'
        : 'above'
      : fitsAbove || !fitsBelow
        ? 'above'
        : 'below';

  const left =
    align === 'left'
      ? EDGE
      : clamp(
          anchor.left + anchor.width / 2 - size.width / 2,
          EDGE,
          Math.max(EDGE, view.width - EDGE - size.width)
        );
  const wantTop = side === 'below' ? bottom(anchor) + GAP : anchor.top - GAP - size.height;
  const top = clamp(wantTop, bandTop, Math.max(bandTop, bandBottom - size.height));

  return {
    top,
    left,
    width: size.width,
    height: size.height,
    pointerX: clamp(anchor.left + anchor.width / 2 - left, 18, size.width - 18),
    side,
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < right(b) && b.left < right(a) && a.top < bottom(b) && b.top < bottom(a);
}

/**
 * Two bubbles that have landed on top of each other, moved apart.
 *
 * The upper one stays put and the lower one drops below it, which keeps the
 * one nearer the top of the page nearer the top of the screen. If the band
 * cannot hold both that way they stack at its foot in card order, and the
 * pointers are left to say which belongs to what — two readable bubbles in
 * roughly the right place beat one readable bubble and one off screen.
 */
export function resolveBubbles(a: Placed, b: Placed, view: View): [Placed, Placed] {
  if (!overlaps(a, b)) return [a, b];

  const { top: bandTop, bottom: bandBottom } = band(view.height, view.keepTop);
  const aIsUpper = a.top <= b.top;
  const upper = aIsUpper ? a : b;
  const lower = aIsUpper ? b : a;

  const dropped: Placed = {
    ...lower,
    top: Math.min(bottom(upper) + GAP, Math.max(bandTop, bandBottom - lower.height)),
  };
  if (!overlaps(upper, dropped)) {
    return aIsUpper ? [upper, dropped] : [dropped, upper];
  }

  const lowerTop = Math.max(bandTop, bandBottom - lower.height);
  const stacked: [Placed, Placed] = [
    { ...upper, top: Math.max(bandTop, lowerTop - GAP - upper.height) },
    { ...lower, top: lowerTop },
  ];
  return aIsUpper ? stacked : [stacked[1], stacked[0]];
}

/**
 * The smallest scroll that brings `r` into the band, or none at all.
 *
 * Positive scrolls the page down, the same sense as window.scrollBy. Smallest
 * on purpose: scrollIntoView({ block: 'center' }) would heave the page about
 * to satisfy a card that only needed an inch, and the card after it would heave
 * it back.
 */
export function minimalScroll(r: Rect, bandTop: number, bandBottom: number): number {
  if (r.height > bandBottom - bandTop) return r.top - bandTop; // taller than the band: line its head up
  if (r.top < bandTop) return r.top - bandTop;
  if (bottom(r) > bandBottom) return bottom(r) - bandBottom;
  return 0;
}
