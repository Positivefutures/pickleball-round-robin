import type { CSSProperties, ReactElement } from 'react';

/**
 * The square button a panel is answered with: the glyph large, the label under
 * it, the whole tile a target.
 *
 * It started as the three things you can do with a live link and is now what
 * every panel answers with, because that row was the one place in the app where
 * the buttons said what they did with a shape as well as a word. A row of these
 * is read at arm's length by somebody holding a phone at the side of a court,
 * which is the whole reason the glyph is there.
 *
 * Pale, not solid. A tile carries its meaning in its ink and its tint — teal for
 * the thing you came here to do, red for the one that takes something away,
 * white for the way out — and a solid fill next to a pale one reads as the only
 * button on the panel that is really a button. Stop Sharing set the pattern and
 * the rest have followed it.
 *
 * `flex-1 basis-0`, so however many are in the row they split it evenly. A
 * panel with only one thing to press puts it in TILE_ALONE instead, which is
 * the same row held to the width of a single tile and centred. Stretched the
 * whole way across it would read as a card rather than as a button, which is
 * why those panels used to keep an ordinary full-width button.
 */

export type TileTone = 'quiet' | 'teal' | 'red';

const BASE =
  'flex flex-1 basis-0 flex-col items-center gap-1.5 rounded-lg border px-1 py-3 shadow-sm ' +
  'transition-colors disabled:opacity-40';

/**
 * `tint` is what a badged glyph rings its corner disc in, so the plus on Add
 * Court sits on top of the court rather than running into it. Left unset it
 * would ring in white and disappear on a tinted tile. See actionIcons.tsx.
 *
 * The teal and red inks are darker than the brand colours they belong to. On a
 * fill this pale the pure colour is a hair under readable, and the darker one is
 * still unmistakably the same colour.
 */
const TONES: Record<TileTone, { className: string; tint: string }> = {
  quiet: {
    className: 'border-panel-edge bg-white text-[#3D495A] hover:bg-[#F1F3F6] disabled:hover:bg-white',
    tint: '#FFFFFF',
  },
  teal: {
    className:
      'border-[#A6D1D5] bg-brand-teal-light text-brand-teal hover:bg-[#D5F0F2] ' +
      'disabled:hover:bg-brand-teal-light',
    tint: 'var(--color-brand-teal-light)',
  },
  red: {
    className: 'border-[#F0C3C3] bg-[#FDF2F2] text-[#B42121] hover:bg-[#FBE6E6] disabled:hover:bg-[#FDF2F2]',
    tint: '#FDF2F2',
  },
};

interface Props {
  tone: TileTone;
  Icon: (props: { className?: string }) => ReactElement;
  /** Title Case, like every button label in the app. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  /** The tour boxes one of these on its last card. */
  dataTutorial?: string;
}

export function TileButton({ tone, Icon, label, onClick, disabled, title, dataTutorial }: Props) {
  const look = TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-tutorial={dataTutorial}
      className={`${BASE} ${look.className}`}
      style={{ '--chip-tint': look.tint } as CSSProperties}
    >
      <Icon className="h-8 w-8" />
      <span className="text-center text-sm font-bold leading-tight">{label}</span>
    </button>
  );
}

/**
 * The row they sit in. Its own export so a panel cannot put them side by side
 * some other way and end up with tiles of two different widths.
 */
export const TILE_ROW = 'flex gap-3';

/**
 * The row a single tile sits in, when a panel has one thing to press.
 *
 * A tile is `flex-1 basis-0` and will happily take a whole phone's width; at
 * that size the glyph is marooned in the middle of a wide box and the thing
 * stops looking like a button. Capped a little wider than one of three across
 * and centred, it is recognisably the same control as the rows elsewhere.
 */
export const TILE_ALONE = 'mx-auto flex w-full max-w-[11rem]';
