import type { CSSProperties, KeyboardEvent, PointerEvent, Ref } from 'react';
import type { RoundType } from '../../types';
import { pillMeta } from '../../lib/roundTypes';
import { ROUND_EDGE, ROUND_FILL, ROUND_HEADING_TEXT } from '../schedule/roundLook';
import { DragHandleIcon } from '../icons';
import { TypeGlyphs } from './typeGlyphs';

/**
 * One round in the Set Game Types list, painted the way the Schedule tab paints
 * that round's card: the same blue, the same 2px edge, ROUND N in the same
 * white heading. The host is setting up the thing they will be looking at in
 * ten minutes, and it should already look like it.
 *
 * A round already played renders no handle at all and a plain `<span>` where
 * the pill would be. The lock is in the markup rather than in a disabled
 * attribute, so there is nothing to focus, nothing to press, and nothing to
 * grab hold of by accident at the side of a court.
 */

interface HandleProps {
  ref: Ref<HTMLButtonElement>;
  style: CSSProperties;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

interface Props {
  roundNumber: number;
  type: RoundType | null;
  locked: boolean;
  dragging: boolean;
  /** The id of the visually-hidden line saying what the arrow keys do. */
  hintId: string;
  rowRef: Ref<HTMLDivElement>;
  rowStyle: CSSProperties;
  handleProps?: HandleProps;
  onOpenPicker: () => void;
}

export function RoundPlanRow({
  roundNumber,
  type,
  locked,
  dragging,
  hintId,
  rowRef,
  rowStyle,
  handleProps,
  onOpenPicker,
}: Props) {
  const meta = pillMeta(type);
  // The short name, not the badge. "Gendered Round" beside ROUND 4 on a 390px
  // phone wrapped the round number onto two lines, and the round number is the
  // thing the host is reading down the list.
  const pillClass = `flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold ${meta.badgeClass} ${meta.badgeEdgeClass}`;

  return (
    <div
      ref={rowRef}
      style={{ ...rowStyle, backgroundColor: ROUND_FILL, borderColor: ROUND_EDGE }}
      className={`flex items-center gap-2 rounded-lg border-2 px-2 py-2 ${dragging ? 'shadow-lg' : 'shadow'}`}
    >
      {locked ? (
        // Where the handle would be, so the numbers stay in a column and a
        // locked row does not shuffle left.
        <span className="h-9 w-9 shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          {...handleProps}
          aria-label={`Move Round ${roundNumber}`}
          aria-describedby={hintId}
          className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md text-white/85 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:cursor-grabbing"
        >
          <DragHandleIcon className="h-6 w-6" />
        </button>
      )}

      <h4
        className={`${ROUND_HEADING_TEXT} min-w-0 flex-1 whitespace-nowrap font-extrabold uppercase text-white`}
      >
        Round {roundNumber}
      </h4>

      {locked ? (
        <span className={pillClass}>
          <TypeGlyphs type={type} size="badge" />
          {meta.shortName}
        </span>
      ) : (
        <button
          type="button"
          onClick={onOpenPicker}
          aria-label={`Game type for Round ${roundNumber}: ${meta.shortName}`}
          className={`${pillClass} transition-transform active:scale-95`}
        >
          <TypeGlyphs type={type} size="badge" />
          {meta.shortName}
        </button>
      )}
    </div>
  );
}
