/**
 * The tour's geometry, checked as arithmetic.
 *
 * This is where the tour is actually tested. The component tests mount the app
 * in happy-dom, which has no layout engine and reports every rect as zero, so
 * they can prove the right card is showing and nothing whatever about where it
 * is drawn. Everything that decides where is in tourGeometry.ts, and all of it
 * is here.
 */
import { describe, it, expect } from 'vitest';
import {
  BUBBLE_MAX,
  DIM,
  EDGE,
  PAD,
  band,
  bubbleWidth,
  dimTiles,
  endAt,
  minimalScroll,
  padRect,
  placeBubble,
  resolveBubbles,
  sameRects,
  unionRect,
  type Placed,
  type Rect,
} from './tourGeometry';

/** An iPhone 14, which is what the copy and the card sizes were written for. */
const PHONE = { width: 390, height: 844 };
const VIEW: Rect = { top: 0, left: 0, width: PHONE.width, height: PHONE.height };

const area = (r: Rect) => r.width * r.height;
const right = (r: Rect) => r.left + r.width;
const bottom = (r: Rect) => r.top + r.height;

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < right(b) && b.left < right(a) && a.top < bottom(b) && b.top < bottom(a);
}

function bubble(top: number, left = 27, height = 90): Placed {
  return { top, left, width: 336, height, pointerX: 168, side: 'below' };
}

describe('padRect', () => {
  it('gives every side the standard breathing room', () => {
    const r = padRect({ top: 100, left: 50, width: 200, height: 40 });
    expect(r).toEqual({
      top: 100 - PAD,
      left: 50 - PAD,
      width: 200 + PAD * 2,
      height: 40 + PAD * 2,
    });
  });

  it('clears the Actions button icons, which hang outside its box', () => {
    // The four tiles sit at -top-[17px], so they contribute nothing to the
    // button's border box and a box drawn on the measurement alone beheads
    // them. 24 clears the overhang with air to spare.
    const button: Rect = { top: 400, left: 132, width: 125, height: 72 };
    const boxed = padRect(button, { top: 24, left: 8, right: 8 });

    expect(boxed.top).toBe(368);
    expect(boxed.height).toBe(72 + (PAD + 24) + PAD);
    expect(button.top - boxed.top).toBeGreaterThan(17);
    expect(boxed.left).toBe(116);
    expect(right(boxed)).toBe(273);
  });
});

describe('unionRect', () => {
  it('is null when there is nothing to enclose', () => {
    expect(unionRect([])).toBeNull();
  });

  it('holds two separated rects', () => {
    const u = unionRect([
      { top: 100, left: 20, width: 100, height: 30 },
      { top: 200, left: 50, width: 200, height: 40 },
    ]);
    expect(u).toEqual({ top: 100, left: 20, width: 230, height: 140 });
  });

  it('applies each anchor its own padding before joining them', () => {
    // The Actions button's generous top padding must not be inherited by
    // whatever it happens to share a box with.
    const a: Rect = { top: 400, left: 100, width: 100, height: 50 };
    const b: Rect = { top: 500, left: 100, width: 100, height: 50 };
    const joined = unionRect([padRect(a, { top: 24 }), padRect(b)])!;

    expect(joined.top).toBe(400 - PAD - 24);
    expect(bottom(joined)).toBe(550 + PAD);
  });
});

describe('endAt', () => {
  it('cuts the box off at the foot of one of its parts', () => {
    // The Schedule card boxes Round 1 from its heading down to below Court 1.
    // Round 1's own panel runs on past that to the other courts and the
    // sit-outs, and boxing the lot would be most of the page.
    const round: Rect = { top: 400, left: 8, width: 374, height: 900 };
    const court: Rect = { top: 470, left: 20, width: 350, height: 230 };
    const box = endAt(unionRect([round, court])!, court);

    expect(box.top).toBe(400);
    expect(box.left).toBe(8);
    expect(box.width).toBe(374);
    expect(bottom(box)).toBe(700);
  });

  it('never goes negative when the parts are the wrong way round', () => {
    const box = endAt(
      { top: 400, left: 0, width: 100, height: 500 },
      { top: 100, left: 0, width: 100, height: 50 }
    );
    expect(box.height).toBe(0);
  });
});

describe('dimTiles', () => {
  it('covers the whole screen when nothing is spotlit', () => {
    expect(dimTiles(VIEW, [])).toEqual([VIEW]);
  });

  it('covers everything but the hole, exactly once', () => {
    const hole: Rect = { top: 200, left: 40, width: 300, height: 120 };
    const tiles = dimTiles(VIEW, [hole]);

    // A 3x3 grid less the hole's own cell. More rects than the four the old
    // overlay drew, and it does not matter: they are disjoint, so the screen
    // still goes to exactly one coat of darkness.
    expect(tiles).toHaveLength(8);
    expect(tiles.reduce((n, t) => n + area(t), 0)).toBe(area(VIEW) - area(hole));
    for (const t of tiles) expect(overlaps(t, hole)).toBe(false);
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        expect(overlaps(tiles[i], tiles[j]), `tiles ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  it('darkens two holes to the same value it darkens one', () => {
    // The point of the grid sweep. Two overlapping scrims would double up
    // between the holes and pull the eye to the gap.
    const a: Rect = { top: 120, left: 30, width: 200, height: 60 };
    const b: Rect = { top: 400, left: 60, width: 260, height: 80 };
    const tiles = dimTiles(VIEW, [a, b]);

    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        expect(overlaps(tiles[i], tiles[j]), `tiles ${i} and ${j} overlap`).toBe(false);
      }
    }
    expect(tiles.reduce((n, t) => n + area(t), 0)).toBe(area(VIEW) - area(a) - area(b));
    for (const t of tiles) {
      expect(overlaps(t, a)).toBe(false);
      expect(overlaps(t, b)).toBe(false);
    }
  });

  it('clips a hole that runs off the screen', () => {
    // Padding pushes a box past the edge routinely: the group name panel is
    // full width, so its ring starts at -8.
    const hole: Rect = { top: -20, left: -8, width: 406, height: 100 };
    const tiles = dimTiles(VIEW, [hole]);

    expect(tiles.reduce((n, t) => n + area(t), 0)).toBe(area(VIEW) - 390 * 80);
    for (const t of tiles) expect(t.left).toBeGreaterThanOrEqual(0);
  });

  it('leaves nothing behind when the hole is the whole screen', () => {
    expect(dimTiles(VIEW, [VIEW])).toEqual([]);
  });
});

describe('placeBubble', () => {
  const size = { width: bubbleWidth(PHONE.width), height: 90 };

  it('is 21rem wide on a phone, with a margin each side', () => {
    expect(bubbleWidth(390)).toBe(BUBBLE_MAX);
    expect(bubbleWidth(320)).toBe(320 - EDGE * 2);
  });

  it('takes a card at its word when the card asks for something narrower', () => {
    // The Players card's second bubble, which sits over the Add Players heading
    // and the rating and gender columns at full width.
    expect(bubbleWidth(390, 230)).toBe(230);
    // But never wider than the standard, and never wider than the screen.
    expect(bubbleWidth(390, 900)).toBe(BUBBLE_MAX);
    expect(bubbleWidth(280, 260)).toBe(280 - EDGE * 2);
  });

  it('sits under what it points at when there is room', () => {
    const p = placeBubble({ top: 120, left: 20, width: 200, height: 40 }, size, PHONE);
    expect(p.side).toBe('below');
    expect(p.top).toBe(170);
  });

  it('goes above when the anchor is low on the screen', () => {
    const p = placeBubble({ top: 790, left: 20, width: 200, height: 60 }, size, PHONE);
    expect(p.side).toBe('above');
    expect(bottom(p)).toBeLessThanOrEqual(790 - 10);
  });

  it('stays inside the band, wherever the anchor is', () => {
    const { bottom: bandBottom } = band(PHONE.height);
    for (let top = 0; top < PHONE.height; top += 17) {
      const p = placeBubble({ top, left: 20, width: 200, height: 44 }, size, PHONE);
      expect(bottom(p), `anchor at ${top}`).toBeLessThanOrEqual(bandBottom);
      expect(p.top, `anchor at ${top}`).toBeGreaterThanOrEqual(EDGE);
    }
  });

  it('stays on screen for an anchor jammed against either edge', () => {
    for (const anchor of [
      { top: 300, left: 0, width: 60, height: 40 },
      { top: 300, left: 330, width: 60, height: 40 },
    ]) {
      const p = placeBubble(anchor, size, PHONE);
      expect(p.left).toBeGreaterThanOrEqual(EDGE);
      expect(right(p)).toBeLessThanOrEqual(PHONE.width - EDGE);
    }
  });

  it('keeps the pointer on the anchor after the bubble has been pushed inward', () => {
    // A 336px bubble beside a control near the right edge is always clamped,
    // so a pointer drawn down its middle would aim at nothing.
    const anchor: Rect = { top: 300, left: 320, width: 60, height: 40 };
    const p = placeBubble(anchor, size, PHONE);
    const pointerOnScreen = p.left + p.pointerX;

    expect(pointerOnScreen).toBeGreaterThanOrEqual(anchor.left);
    expect(pointerOnScreen).toBeLessThanOrEqual(right(anchor));
    expect(p.pointerX).toBeGreaterThanOrEqual(18);
    expect(p.pointerX).toBeLessThanOrEqual(size.width - 18);
  });
});

describe('resolveBubbles', () => {
  const size = { width: 336, height: 90 };

  it('leaves two that already clear each other alone', () => {
    const a = bubble(100);
    const b = bubble(400);
    expect(resolveBubbles(a, b, PHONE)).toEqual([a, b]);
  });

  it('drops the lower one clear, keeping the upper one where it was', () => {
    const a = bubble(200);
    const b = bubble(240);
    const [ra, rb] = resolveBubbles(a, b, PHONE);

    expect(ra.top).toBe(200);
    expect(overlaps(ra, rb)).toBe(false);
    expect(rb.top).toBeGreaterThan(ra.top);
  });

  it('separates two bubbles anchored forty pixels apart', () => {
    const a = placeBubble({ top: 200, left: 20, width: 100, height: 30 }, size, PHONE);
    const b = placeBubble({ top: 240, left: 220, width: 100, height: 30 }, size, PHONE);
    const [ra, rb] = resolveBubbles(a, b, PHONE);

    expect(overlaps(ra, rb)).toBe(false);
    for (const r of [ra, rb]) {
      expect(r.top).toBeGreaterThanOrEqual(EDGE);
      expect(bottom(r)).toBeLessThanOrEqual(band(PHONE.height).bottom);
    }
  });

  it('stacks them at the foot when the band cannot hold them apart', () => {
    // Two tall bubbles low down. Neither fits below the other, so both end up
    // in the band with the argument order preserved.
    const a = bubble(560, 27, 150);
    const b = bubble(580, 27, 150);
    const [ra, rb] = resolveBubbles(a, b, PHONE);

    expect(overlaps(ra, rb)).toBe(false);
    expect(ra.top).toBeLessThan(rb.top);
    expect(bottom(rb)).toBeLessThanOrEqual(band(PHONE.height).bottom);
  });

  it('does not care which order it is handed them in', () => {
    const a = bubble(200);
    const b = bubble(240);
    const [ra, rb] = resolveBubbles(a, b, PHONE);
    const [sb, sa] = resolveBubbles(b, a, PHONE);

    expect(sa).toEqual(ra);
    expect(sb).toEqual(rb);
  });
});

describe('minimalScroll', () => {
  const { top: bandTop, bottom: bandBottom } = band(PHONE.height);

  it('does nothing when the box is already in the band', () => {
    expect(minimalScroll({ top: 100, left: 0, width: 390, height: 200 }, bandTop, bandBottom)).toBe(0);
  });

  it('scrolls down by exactly the overhang, and no further', () => {
    const box: Rect = { top: 700, left: 0, width: 390, height: 200 };
    const by = minimalScroll(box, bandTop, bandBottom);

    expect(by).toBe(900 - bandBottom);
    expect(by).toBeGreaterThan(0);
    // Applying it puts the foot of the box exactly on the band's floor.
    expect(bottom({ ...box, top: box.top - by })).toBe(bandBottom);
  });

  it('scrolls up when the box is above the band', () => {
    const by = minimalScroll({ top: -40, left: 0, width: 390, height: 100 }, bandTop, bandBottom);
    expect(by).toBe(-40 - bandTop);
    expect(by).toBeLessThan(0);
  });

  it('lines up the head of a box taller than the band', () => {
    // The Schedule tab's Round 1 panel down to below Court 1 is taller than
    // the free strip on a small phone. Showing its head beats centring it.
    const box: Rect = { top: 450, left: 0, width: 390, height: 900 };
    const by = minimalScroll(box, bandTop, bandBottom);
    expect(box.top - by).toBe(bandTop);
  });
});

describe('the shared constants', () => {
  it('gives a bubble the whole screen less its margins', () => {
    // iPhone SE. The buttons ride inside the bubbles now, so nothing along the
    // foot is reserved and the tallest card still has room on the shortest phone.
    const small = band(667);
    expect(small.top).toBe(EDGE);
    expect(small.bottom).toBe(667 - EDGE);
  });

  it('dims less than the app dims behind a modal', () => {
    // A modal says "deal with me"; this says "look here". If they match, the
    // tour reads as a dialog with a hole in it.
    const alpha = Number(DIM.match(/([\d.]+)\)$/)![1]);
    expect(alpha).toBeLessThan(0.4);
    expect(alpha).toBeGreaterThan(0.25);
  });
});

describe('sameRects', () => {
  it('is what stops the measure loop re-rendering a settled screen', () => {
    const a: Rect = { top: 1, left: 2, width: 3, height: 4 };
    expect(sameRects([a, null], [{ ...a }, null])).toBe(true);
    expect(sameRects([a], [{ ...a, top: 2 }])).toBe(false);
    expect(sameRects([a], [a, a])).toBe(false);
    expect(sameRects([null], [a])).toBe(false);
  });
});
