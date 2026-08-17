import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { appScrollBy, appScrollY } from '../lib/appScroll';

/**
 * A list whose rows can be picked up and moved, by finger and by keyboard.
 *
 * Indices are positions in the list, 0 first. `onMove(from, to)` is called once,
 * on drop or on an arrow key, and the caller owns what that means — this hook
 * knows nothing about what is in the rows.
 *
 * Two rules it keeps that are easy to get wrong on a phone:
 *
 * - The pointer is not captured on the way down. Capturing there redirects the
 *   click and a button under the finger never hears about it, which is the
 *   reason written out at ActionsSheet.tsx:471-474. It is captured on the first
 *   move past the threshold instead, so a tap on the handle stays a tap.
 * - `onPointerCancel` commits and resets exactly as `onPointerUp` does. iOS
 *   fires it on a system gesture, and without it the list stays stuck mid-drag.
 *
 * Nothing in the DOM moves while a drag is running. Every row is translated,
 * and the list is reordered once, on drop, by the caller's own state — so React
 * is never asked to reconcile a list that is halfway to somewhere.
 *
 * The drop is the part worth reading twice, because the obvious version of it
 * is visibly wrong. Clearing the travel and reordering the list in one go looks
 * like everything springs back where it came from and then walks to the new
 * place, which is the row's content arriving in its new slot while the slot is
 * still animating home. So the drop happens in two beats instead:
 *
 * 1. **Landing.** The finger let go somewhere between two rows, so the row
 *    slides the rest of the way into the slot it chose. Everything else is
 *    already where it is going — it moved out of the way during the drag.
 * 2. **The still frame.** Now that every row is exactly over the slot it will
 *    occupy, the travel is dropped and the list is reordered in the same paint,
 *    with transitions off. Nothing can move, because there is nowhere left to
 *    move to: the round numbers relabel and the rows stay put.
 *
 * The split between the ref and the state below is deliberate. `press` is what
 * the finger is doing and is written on every pointer event, so it is a ref;
 * `drag` is what the list is drawing and so it is state. Nothing here reads a
 * ref while rendering.
 */

/** Past this many pixels it is a drag rather than a tap. Matches ActionsSheet. */
const DRAG_THRESHOLD = 4;

/** How close to the top or bottom of the window starts an auto-scroll. */
const EDGE = 80;

/** The most it scrolls in one frame, at the very edge of the window. */
const MAX_SCROLL_STEP = 14;

/**
 * How long a row takes to settle into the slot it was dropped on, and the one
 * length every transition in here runs at. The rows getting out of the way use
 * it during the drag, so the row landing among them has to move at their speed.
 */
const SLIDE_MS = 150;

interface Options {
  count: number;
  /** A row that cannot be moved, and cannot be moved past. */
  disabled?: (index: number) => boolean;
  onMove: (from: number, to: number) => void;
}

/** A finger on a handle, which is not yet a drag. */
interface Press {
  from: number;
  /** Where it went down, in document coordinates. */
  startDoc: number;
  /** Where it is now in the window, for the edge scroll. */
  clientY: number;
  captured: boolean;
}

/** A drag under way, measured once when it started. */
interface Drag {
  from: number;
  /** Every row's centre at drag start, in document coordinates. */
  centres: number[];
  /** The indices that may move, in order. */
  open: number[];
}

export interface ListReorder {
  /** The row being dragged, or null. */
  dragging: number | null;
  /** Spread onto the grab handle, which must be a real `<button>`. */
  handleProps: (index: number) => {
    ref: (el: HTMLButtonElement | null) => void;
    style: CSSProperties;
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
  };
  /** Spread onto the row itself. */
  rowProps: (index: number) => {
    ref: (el: HTMLElement | null) => void;
    style: CSSProperties;
  };
}

export function useListReorder({ count, disabled, onMove }: Options): ListReorder {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const handles = useRef<(HTMLButtonElement | null)[]>([]);
  const press = useRef<Press | null>(null);
  const frame = useRef<number | null>(null);
  /** The move that has been let go of and is sliding into place. */
  const landing = useRef<{ from: number; to: number; timer: number } | null>(null);
  /** The frames counted out before transitions are allowed back. */
  const paint = useRef<number | null>(null);

  const [drag, setDrag] = useState<Drag | null>(null);
  /** How far the dragged row has travelled, in document coordinates. */
  const [offset, setOffset] = useState(0);
  /** The dropped row is sliding home: it needs a transition, not the finger. */
  const [settling, setSettling] = useState(false);
  /** The still frame. No row may move on the paint the reorder lands in. */
  const [frozen, setFrozen] = useState(false);

  const canMove = useCallback((i: number) => !disabled?.(i), [disabled]);

  const openIndices = useCallback(
    () => Array.from({ length: count }, (_, i) => i).filter(canMove),
    [canMove, count]
  );

  /** Where the dragged row would land: the row whose midpoint it has crossed. */
  let target: number | null = null;
  if (drag !== null) {
    const centre = drag.centres[drag.from] + offset;
    target = drag.from;
    if (offset > 0) {
      for (const j of drag.open) {
        if (j > drag.from && drag.centres[j] <= centre) target = j;
      }
    } else {
      for (let k = drag.open.length - 1; k >= 0; k--) {
        const j = drag.open[k];
        if (j < drag.from && drag.centres[j] >= centre) target = j;
      }
    }
  }

  const clearTimers = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (paint.current !== null) cancelAnimationFrame(paint.current);
    if (landing.current !== null) clearTimeout(landing.current.timer);
    frame.current = null;
    paint.current = null;
    landing.current = null;
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    press.current = null;
    setDrag(null);
    setOffset(0);
    setSettling(false);
    setFrozen(false);
  }, [clearTimers]);

  // A drag interrupted by an unmount would leave a rAF loop running against a
  // list nobody is looking at.
  useEffect(() => stop, [stop]);

  /**
   * Sixteen rounds is taller than a phone, so a drag has to be able to reach
   * the end of the list. The app's scroll pane moves while the finger sits in
   * the top or bottom strip, and the travel is measured in page coordinates —
   * clientY plus how far down the pane is — so a row under a stationary finger
   * keeps moving as the page goes by underneath it.
   *
   * A `function` rather than a const so it can schedule itself, which is the
   * one thing a `useCallback` cannot do.
   */
  const startEdgeScroll = useCallback(() => {
    function tick() {
      frame.current = null;
      const finger = press.current;
      if (finger === null) return;

      const top = finger.clientY - EDGE;
      const bottom = finger.clientY - (window.innerHeight - EDGE);
      let step = 0;
      if (top < 0) step = Math.max(-MAX_SCROLL_STEP, (top / EDGE) * MAX_SCROLL_STEP);
      else if (bottom > 0) step = Math.min(MAX_SCROLL_STEP, (bottom / EDGE) * MAX_SCROLL_STEP);

      if (step !== 0) {
        const before = appScrollY();
        appScrollBy(step);
        // Only if the page actually moved. At either end of the pane it has
        // not, and pretending otherwise would drag the row off the list.
        if (appScrollY() !== before) {
          setOffset(finger.clientY + appScrollY() - finger.startDoc);
        }
      }
      frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
  }, []);

  /**
   * The still frame: drop the travel and reorder the list in the same paint.
   *
   * Every row is already sitting over the slot it is about to occupy, so this
   * changes no pixel except the labels — which is the whole point. Transitions
   * are off while it happens, because a transition here is the list animating
   * back from where it already is.
   */
  const settle = useCallback(
    (from: number, to: number) => {
      clearTimers();
      press.current = null;
      setFrozen(true);
      setDrag(null);
      setOffset(0);
      setSettling(false);
      onMove(from, to);

      // Two frames, not one. A rAF asked for from inside a pointer handler can
      // still run before the browser has painted, and letting transitions back
      // in before that paint is the flicker all over again.
      paint.current = requestAnimationFrame(() => {
        paint.current = requestAnimationFrame(() => {
          paint.current = null;
          setFrozen(false);
        });
      });
    },
    [clearTimers, onMove]
  );

  /** Land a move that is still sliding, now, because something else is starting. */
  const flush = useCallback(() => {
    const pending = landing.current;
    if (pending !== null) settle(pending.from, pending.to);
  }, [settle]);

  const finish = useCallback(() => {
    // Already let go of. A pointerup and a pointercancel can both arrive for
    // one gesture, and the second must not start a second landing.
    if (landing.current !== null) return;
    if (drag === null || target === null || target === drag.from) {
      stop();
      return;
    }
    // The finger let go between two rows. Slide the rest of the way into the
    // slot it chose before anything is reordered, so that when the reorder
    // comes there is nothing left for it to move.
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    press.current = null;

    const { from } = drag;
    const to = target;
    setSettling(true);
    setOffset(drag.centres[to] - drag.centres[from]);
    landing.current = {
      from,
      to,
      timer: window.setTimeout(() => settle(from, to), SLIDE_MS),
    };
  }, [drag, settle, stop, target]);

  const handleProps = useCallback(
    (index: number) => ({
      ref: (el: HTMLButtonElement | null) => {
        handles.current[index] = el;
      },
      // iOS Safari will not let preventDefault stop a scroll already under way,
      // so the handle has to say up front that it is not something to scroll on.
      style: { touchAction: 'none' as const },

      onPointerDown: (e: PointerEvent) => {
        // A second grab while the last one is still sliding. Land it first, or
        // its timer fires part way through the new drag and moves the wrong row.
        flush();
        if (!canMove(index)) return;
        press.current = {
          from: index,
          startDoc: e.clientY + appScrollY(),
          clientY: e.clientY,
          captured: false,
        };
      },

      onPointerMove: (e: PointerEvent) => {
        const finger = press.current;
        if (finger === null) return;
        const dy = e.clientY + appScrollY() - finger.startDoc;
        finger.clientY = e.clientY;

        if (!finger.captured) {
          if (Math.abs(dy) < DRAG_THRESHOLD) return;
          finger.captured = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          // Measured once, here. Nothing has moved between the finger going
          // down and it crossing the threshold, and nothing else moves until
          // the drop.
          const centres: number[] = [];
          for (let i = 0; i < count; i++) {
            const rect = rows.current[i]?.getBoundingClientRect();
            centres[i] = rect ? rect.top + rect.height / 2 + appScrollY() : 0;
          }
          setDrag({ from: finger.from, centres, open: openIndices() });
          if (frame.current === null) startEdgeScroll();
        }
        e.preventDefault();
        setOffset(dy);
      },

      onPointerUp: finish,
      // Not optional. iOS fires this instead of pointerup on a system gesture,
      // and a list left mid-drag has no way back.
      onPointerCancel: finish,

      onKeyDown: (e: KeyboardEvent) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        flush();
        if (!canMove(index)) return;
        const open = openIndices();
        const at = open.indexOf(index);
        const to = open[at + (e.key === 'ArrowUp' ? -1 : 1)];
        if (to === undefined) return;
        e.preventDefault();
        onMove(index, to);
        // Focus follows what was moved, not the row it was moved out of. React
        // keeps the same DOM node at the same index, so without this the host
        // is left holding the row they have just moved away from.
        requestAnimationFrame(() => handles.current[to]?.focus());
      },
    }),
    [canMove, count, finish, flush, onMove, openIndices, startEdgeScroll]
  );

  const rowProps = useCallback(
    (index: number) => {
      let translate = 0;

      if (drag !== null && target !== null) {
        if (index === drag.from) {
          // Kept inside the list: the first and last movable rows are as far as
          // a row can go, however far the finger travels past them.
          const first = drag.open[0];
          const last = drag.open[drag.open.length - 1];
          const low = drag.centres[first] - drag.centres[drag.from];
          const high = drag.centres[last] - drag.centres[drag.from];
          translate = Math.min(high, Math.max(low, offset));
        } else {
          // Every row the dragged one has passed steps into the slot it just
          // left. Measured rather than assumed, so a row that wraps onto two
          // lines still lands where it should.
          const at = drag.open.indexOf(index);
          const from = drag.open.indexOf(drag.from);
          const to = drag.open.indexOf(target);
          if (at >= 0) {
            if (from < to && at > from && at <= to) {
              translate = drag.centres[drag.open[at - 1]] - drag.centres[index];
            } else if (to < from && at >= to && at < from) {
              translate = drag.centres[drag.open[at + 1]] - drag.centres[index];
            }
          }
        }
      }

      const lifted = drag?.from === index;
      return {
        ref: (el: HTMLElement | null) => {
          rows.current[index] = el;
        },
        style: {
          transform: translate === 0 ? undefined : `translateY(${translate}px)`,
          // Nothing moves on the frame the list is reordered. Then: the row
          // under the finger keeps up with it, the ones getting out of its way
          // slide, and a row let go of slides too, into the gap they left.
          transition:
            frozen || (lifted && !settling) ? 'none' : `transform ${SLIDE_MS}ms ease`,
          zIndex: lifted ? 20 : undefined,
          position: lifted ? ('relative' as const) : undefined,
          touchAction: drag === null ? undefined : ('none' as const),
        } satisfies CSSProperties,
      };
    },
    [drag, frozen, offset, settling, target]
  );

  return { dragging: drag?.from ?? null, handleProps, rowProps };
}
