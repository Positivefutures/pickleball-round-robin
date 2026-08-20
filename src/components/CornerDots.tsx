/**
 * The dot-grid decoration a page card carries in its top-right corner.
 *
 * It started on Setup, written into that panel. Players wanted the same corner
 * on two of its own cards, and a second and third copy of an `<img>` with a
 * hand-tuned percentage on it is how three panels end up decorated three
 * slightly different ways. One component, two sizes.
 *
 * A third of the panel is the share it takes on Setup, so it keeps that share
 * on a phone rather than swallowing the corner; 144px is its own size and it
 * never grows past it. Behind everything and untappable, so a long word passes
 * over it rather than being pushed down a line — which is why every panel that
 * uses this needs `relative overflow-hidden` and its own content in a
 * `relative` wrapper above it.
 */
export function CornerDots({ smaller = false }: {
  /** A tenth off, which is the size the Players cards take it at. */
  smaller?: boolean;
}) {
  return (
    <img
      src="/corner-dots.png"
      alt=""
      width={144}
      height={126}
      className={`pointer-events-none absolute right-1.5 top-1.5 select-none ${
        smaller ? 'w-[20.97%] max-w-[91px]' : 'w-[23.3%] max-w-[101px]'
      }`}
    />
  );
}
