import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';

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

  const [drag, setDrag] = useState<Drag | null>(null);
  /** How far the dragged row has travelled, in document coordinates. */
  const [offset, setOffset] = useState(0);

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

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    press.current = null;
    setDrag(null);
    setOffset(0);
  }, []);

  // A drag interrupted by an unmount would leave a rAF loop running against a
  // list nobody is looking at.
  useEffect(() => stop, [stop]);

  /**
   * Sixteen rounds is taller than a phone, so a drag has to be able to reach
   * the end of the list. The window scrolls while the finger sits in the top or
   * bottom strip, and the travel is measured in document coordinates — so a row
   * under a stationary finger keeps moving as the page goes by underneath it.
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
        const before = window.scrollY;
        window.scrollBy(0, step);
        // Only if the page actually moved. At either end of the document it
        // has not, and pretending otherwise would drag the row off the list.
        if (window.scrollY !== before) {
          setOffset(finger.clientY + window.scrollY - finger.startDoc);
        }
      }
      frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
  }, []);

  const finish = useCallback(() => {
    const from = drag?.from;
    const to = target;
    stop();
    if (from === undefined || to === null || to === from) return;
    onMove(from, to);
  }, [drag, onMove, stop, target]);

  const handleProps = useCallback(
    (index: number) => ({
      ref: (el: HTMLButtonElement | null) => {
        handles.current[index] = el;
      },
      // iOS Safari will not let preventDefault stop a scroll already under way,
      // so the handle has to say up front that it is not something to scroll on.
      style: { touchAction: 'none' as const },

      onPointerDown: (e: PointerEvent) => {
        if (!canMove(index)) return;
        press.current = {
          from: index,
          startDoc: e.clientY + window.scrollY,
          clientY: e.clientY,
          captured: false,
        };
      },

      onPointerMove: (e: PointerEvent) => {
        const finger = press.current;
        if (finger === null) return;
        const dy = e.clientY + window.scrollY - finger.startDoc;
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
            centres[i] = rect ? rect.top + rect.height / 2 + window.scrollY : 0;
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
    [canMove, count, finish, onMove, openIndices, startEdgeScroll]
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
          // The row under the finger keeps up with it; the ones getting out of
          // its way slide.
          transition: lifted ? 'none' : 'transform 150ms ease',
          zIndex: lifted ? 20 : undefined,
          position: lifted ? ('relative' as const) : undefined,
          touchAction: drag === null ? undefined : ('none' as const),
        } satisfies CSSProperties,
      };
    },
    [drag, offset, target]
  );

  return { dragging: drag?.from ?? null, handleProps, rowProps };
}
