import type { ReactElement } from 'react';

/**
 * The glyph a panel opens with, centred above its title.
 *
 * The Actions sheet started this: every action's panel is headed by the shape
 * that was on the card you tapped, so a panel is recognised before it is read.
 * The panels behind the settings drawer had no such mark, and one component
 * rather than five copies is what keeps the size and the colour the same in
 * every one of them.
 *
 * Decorative by definition. The title underneath already says what the panel is,
 * and `Solid`/`Stroked` in icons.tsx set `aria-hidden` on the artwork, so this
 * adds nothing for a screen reader to read twice.
 */
export function PanelGlyph({
  icon: Icon,
  className,
}: {
  icon: (props: { className?: string }) => ReactElement;
  /** Added to the glyph itself, for the one that arrives lying on its side. */
  className?: string;
}) {
  return (
    <div className="mb-2 flex justify-center text-brand-teal">
      <Icon className={`h-14 w-14 ${className ?? ''}`} />
    </div>
  );
}
