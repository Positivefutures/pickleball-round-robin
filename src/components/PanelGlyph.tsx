import type { ReactElement, ReactNode } from 'react';

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

/**
 * How every panel in the app opens: one teal glyph, centred, with the title
 * centred under it.
 *
 * One component rather than a pattern people copy. The settings panels had the
 * glyph and the dialogs did not, and among the dialogs the title was sometimes a
 * heading, sometimes a line of body copy, and never quite the same size twice.
 * There is one answer now and this is where it is written down.
 *
 * A confirming dialog puts its question here. That is what the panel is for and
 * what its title should say, and a question set as body copy in the middle of a
 * box reads as the first half of the warning under it.
 */
export function PanelHeading({
  icon,
  title,
  glyphClassName,
}: {
  icon: (props: { className?: string }) => ReactElement;
  title: ReactNode;
  /** Passed through to the glyph, for the one that arrives lying on its side. */
  glyphClassName?: string;
}) {
  return (
    <>
      <PanelGlyph icon={icon} className={glyphClassName} />
      <h2 className="text-center text-[1.35rem] font-extrabold text-[#222]">{title}</h2>
    </>
  );
}
