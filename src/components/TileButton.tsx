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
 * The two solid tones are the round timer's, and the exception proves that rule
 * rather than breaking it: on a countdown the point *is* that one key on the row
 * is the one to press, and a host looking up from a court reads a green block
 * and a red block without reading either label. Nothing outside the timer should
 * reach for them. See the note on --color-start-green in index.css.
 *
 * `flex-1 basis-0`, so however many are in the row they split it evenly. A
 * panel with only one thing to press puts it in TILE_ALONE instead, which is
 * the same row held to the width of a single tile and centred. Stretched the
 * whole way across it would read as a card rather than as a button, which is
 * why those panels used to keep an ordinary full-width button.
 */

export type TileTone = 'quiet' | 'teal' | 'red' | 'solid-green' | 'solid-red';

const BASE =
  'flex flex-1 basis-0 flex-col items-center rounded-lg border shadow-sm ' +
  'transition-colors disabled:opacity-40';

/**
 * How big the tile is drawn. There is no `size` anywhere else in the app yet
 * (finding F2), so this is the first one, and it is deliberately two values
 * rather than a scale: the ordinary tile, and the one the round timer answers
 * with.
 *
 * `lg` is the label at half again — 14px to 21px — with the glyph and the
 * padding grown to match, because a 21px word under a 32px glyph in a tile
 * still padded for 14px reads as a normal tile someone has zoomed. The timer is
 * the one panel in the app read from several feet away, propped on a bench at
 * the side of a court, and that is what it is for.
 */
export type TileSize = 'md' | 'lg';

const SIZES: Record<TileSize, { className: string; icon: string }> = {
  md: { className: 'gap-1.5 px-1 py-3 text-sm', icon: 'h-8 w-8' },
  lg: { className: 'gap-2 px-1 py-4 text-[1.3125rem]', icon: 'h-10 w-10' },
};

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
  'solid-green': {
    className:
      'border-start-green-dark bg-start-green text-white hover:bg-start-green-dark ' +
      'disabled:hover:bg-start-green',
    tint: 'var(--color-start-green)',
  },
  'solid-red': {
    className:
      'border-stop-red-dark bg-stop-red text-white hover:bg-stop-red-dark ' +
      'disabled:hover:bg-stop-red',
    tint: 'var(--color-stop-red)',
  },
};

interface Props {
  tone: TileTone;
  /** Defaults to the ordinary tile. Only the round timer asks for `lg`. */
  size?: TileSize;
  Icon: (props: { className?: string }) => ReactElement;
  /** Title Case, like every button label in the app. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  /** The tour boxes one of these on its last card. */
  dataTutorial?: string;
}

export function TileButton({
  tone,
  size = 'md',
  Icon,
  label,
  onClick,
  disabled,
  title,
  dataTutorial,
}: Props) {
  const look = TONES[tone];
  const scale = SIZES[size];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-tutorial={dataTutorial}
      className={`${BASE} ${scale.className} ${look.className}`}
      style={{ '--chip-tint': look.tint } as CSSProperties}
    >
      <Icon className={scale.icon} />
      <span className="text-center font-bold leading-tight">{label}</span>
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
