import type { ReactNode } from 'react';
import { CourtIcon } from '../icons';

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

/** A court with a plus at its corner. Add Court. */
export function AddCourtIcon({ className }: { className?: string }) {
  return (
    <Badged
      className={className}
      base={<CourtIcon className="h-full w-full" />}
      mark={<BadgeMark />}
    />
  );
}

/** The same court with a minus. Remove Court. */
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
 * A QR code. Share Live Session.
 *
 * Drawn rather than composed, and deliberately not the ShareIcon the menu uses
 * for Share App: the two send different things, and the square is what is
 * actually going to be on screen when the card is tapped.
 *
 * Three finder squares and a scatter of modules, on the 24 grid the rest of the
 * sheet's glyphs use. It is a picture of a code and not a real one, so nothing
 * here has to encode anything.
 */
export function ShareSessionIcon({ className }: { className?: string }) {
  const finder = (x: number, y: number) => (
    <>
      <rect x={x} y={y} width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x={x + 2.5} y={y + 2.5} width="2" height="2" fill="currentColor" />
    </>
  );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      {finder(1, 1)}
      {finder(16, 1)}
      {finder(1, 16)}
      <rect x="16" y="16" width="2.5" height="2.5" />
      <rect x="20.5" y="16" width="2.5" height="2.5" />
      <rect x="16" y="20.5" width="2.5" height="2.5" />
      <rect x="20.5" y="20.5" width="2.5" height="2.5" />
      <rect x="11" y="1" width="2.5" height="2.5" />
      <rect x="11" y="6" width="2.5" height="2.5" />
      <rect x="11" y="11" width="2.5" height="2.5" />
      <rect x="1" y="11" width="2.5" height="2.5" />
      <rect x="6" y="11" width="2.5" height="2.5" />
      <rect x="16" y="11" width="2.5" height="2.5" />
      <rect x="20.5" y="11" width="2.5" height="2.5" />
      <rect x="11" y="16" width="2.5" height="2.5" />
      <rect x="11" y="20.5" width="2.5" height="2.5" />
    </svg>
  );
}
