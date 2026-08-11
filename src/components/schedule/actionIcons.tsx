import type { ReactNode } from 'react';
import { CourtIcon, PencilIcon, StarIcon } from '../icons';

/**
 * The three Actions glyphs that are one shape with a smaller one at its corner:
 * a court being added or taken away, and the rating star being edited.
 *
 * Composed in the layout rather than merged into single paths, because the
 * source files are drawn on three different grids (512, 512 and 32) and stacking
 * them keeps each exactly as it was supplied. The badge is a disc in the glyph's
 * own colour, ringed and marked in the chip's tint, so it reads as sitting on
 * top of the shape rather than running into it. `--chip-tint` is set by the card
 * the icon sits in; see ActionsSheet.
 */
function Badged({
  base,
  mark,
  className = 'w-4 h-4',
}: {
  base: ReactNode;
  mark: ReactNode;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {base}
      <span
        className="absolute -bottom-[6%] -right-[6%] flex h-[54%] w-[54%] items-center
                   justify-center rounded-full bg-current ring-2 ring-[var(--chip-tint)]"
      >
        {mark}
      </span>
    </span>
  );
}

/** A plus or minus stroked in the chip's tint, for the badge above. */
function BadgeMark({ minus = false }: { minus?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[62%] w-[62%]"
      fill="none"
      stroke="var(--chip-tint)"
      strokeWidth="4"
      strokeLinecap="round"
    >
      <path d="M4 12h16" />
      {!minus && <path d="M12 4v16" />}
    </svg>
  );
}

/** A court with a plus at its corner. Add a Court. */
export function AddCourtIcon({ className }: { className?: string }) {
  return (
    <Badged
      className={className}
      base={<CourtIcon className="h-full w-full" />}
      mark={<BadgeMark />}
    />
  );
}

/** The same court with a minus. Remove a Court. */
export function RemoveCourtIcon({ className }: { className?: string }) {
  return (
    <Badged
      className={className}
      base={<CourtIcon className="h-full w-full" />}
      mark={<BadgeMark minus />}
    />
  );
}

/**
 * The rating star with a pencil at its corner. Edit Player Rating.
 *
 * The star is the one the Default Player Rating panel is headed with, so a
 * rating changed here and a rating set there read as the same thing.
 */
export function EditRatingIcon({ className }: { className?: string }) {
  return (
    <Badged
      className={className}
      base={<StarIcon className="h-full w-full" />}
      mark={<PencilIcon className="h-[58%] w-[58%] text-[var(--chip-tint)]" />}
    />
  );
}
