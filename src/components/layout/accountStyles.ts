import { panelCard } from '../panelStyles';

/**
 * The My Account panels share one look, so their class strings live here rather
 * than being copied three ways and drifting.
 *
 * It was built in a green of its own, sampled from `INBOX/my-account-mockup.png`
 * back when the app had no settled palette. It has one now — teal confirms,
 * orange leads — and a family of panels in a green nothing else uses was the
 * last place the old scheme was still on show. So the green is gone: the button
 * that does the thing, the switchboard of pale fills and the line that says
 * you are signed in are all in `--color-brand-teal` and its two neighbours.
 *
 * The card is #FEFEFE, which is also the background `account-top.png` was
 * exported against — that image ships opaque, so tinting the card any further
 * shows the hero as a rectangle. The same is true of `share-top.png` and
 * `donate-top.png`, which is why all three cards are the same near-white.
 *
 * Strings only, no components: this file is imported by three panels, and a .tsx
 * that exports both would trip react-refresh/only-export-components.
 */

export const TEAL = 'var(--color-brand-teal)';

/**
 * The pale teal a tile is filled with, and its edge.
 *
 * Written out rather than imported from TileButton, which owns them as part of
 * a button and not as a palette. They are the same two values on purpose: a
 * quiet teal panel here and a teal tile on the Actions sheet should be the same
 * quiet teal.
 */
export const TEAL_FILL = 'border-[#A6D1D5] bg-brand-teal-light';

/** The card itself. Its edge is the one every panel in the app is drawn with. */
export const card =
  `mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain ${panelCard} ` +
  'bg-[#FEFEFE] px-6 py-6';

export const backdrop =
  'no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40';

export const heading = 'mt-1 text-center text-4xl font-extrabold tracking-tight text-[#111F1F]';

/** The one-line status under the heading. Teal because it is never bad news. */
export const status = 'mt-1 text-center text-xl font-bold text-brand-teal';

/**
 * A note that is good news: a code sent, a file saved, an account made.
 *
 * Four panels were each writing `border-green-200 bg-green-50 text-green-900`
 * out for themselves, which is how the green survived a repaint the first time.
 * One name now, in the teal that means the same thing everywhere else.
 */
export const good = `${TEAL_FILL} text-[#04565D]`;

export const blurb = 'mt-2 text-center text-lg leading-snug text-[#495668]';

export const label = 'mb-1.5 block text-sm font-bold text-[#1F293D]';

export const field =
  'w-full rounded-lg border border-panel-edge bg-white px-3.5 py-3 text-lg text-[#1F293D] ' +
  'placeholder:text-[#7F8497] focus:border-brand-teal focus:outline-none focus:ring-2 ' +
  'focus:ring-brand-teal/30';

/** Solid, unlike the tiles: it is the one thing these panels are open to do. */
export const primary =
  'w-full rounded-lg bg-brand-teal px-4 py-3.5 text-lg font-bold text-white transition-colors ' +
  'hover:bg-brand-teal-dark disabled:cursor-not-allowed disabled:bg-[#9DC3C7]';

export const secondary =
  'w-full rounded-lg border border-panel-edge bg-[#F7F7F8] px-4 py-3 text-lg font-bold ' +
  'text-[#3A4353] transition-colors hover:bg-[#EDF0F4] disabled:cursor-not-allowed disabled:opacity-60';

/**
 * An account action, shaped like SharePanel's buttons: a title with a quieter
 * line under it saying what actually happens. Two of these read as a list, which
 * is what stops Change email, Sign out and Close from being three identical grey
 * slabs — the complaint that started this rebuild.
 */
export const row =
  'flex w-full items-center gap-3 rounded-lg border border-panel-edge bg-white px-4 py-3 ' +
  'text-left transition-colors hover:bg-[#F1F3F6] disabled:cursor-not-allowed disabled:opacity-60';

export const rowTitle = 'block font-bold text-[#1F293D]';
export const rowNote = 'block text-sm text-[#6B7684]';

/**
 * The glyph at the head of a row. Big enough to stand beside both lines rather
 * than label the first one, which is why it is set here once: the four rows live
 * in two files and a row half a size out would be the only thing you could see.
 */
export const rowIcon = 'h-8 w-8 text-[#3A4353]';

/**
 * The one row on this panel that cannot be undone.
 *
 * Red, but quietly: a bordered white row rather than a filled button, because
 * it sits below Sign Out and nothing there should be the loudest thing on a
 * screen people open to check their email address. The full red is saved for
 * the confirm button, which is the tap that actually does it.
 */
export const rowDanger =
  'flex w-full items-center gap-3 rounded-lg border border-[#E7C3C0] bg-white px-4 py-3 ' +
  'text-left transition-colors hover:bg-[#FDF3F2] disabled:cursor-not-allowed disabled:opacity-60';

export const rowDangerTitle = 'block font-bold text-[#9B2C2C]';

/** The bin, in the same red as the words next to it. */
export const rowIconDanger = 'h-8 w-8 text-[#9B2C2C]';

export const danger =
  'w-full rounded-lg bg-[#B42318] px-4 py-3.5 text-lg font-bold text-white transition-colors ' +
  'hover:bg-[#96170F] disabled:cursor-not-allowed disabled:bg-[#DDB3AF]';

/** The sync note and its siblings. Colour is set per state by the caller. */
export const note = 'mt-4 rounded-xl border px-3.5 py-3';

export const muted = 'mt-3 flex items-center justify-center gap-2 text-center text-sm text-[#69727F]';
