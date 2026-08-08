/**
 * The My Account panels share one look, so their class strings live here rather
 * than being copied three ways and drifting.
 *
 * Every colour is sampled from `INBOX/my-account-mockup.png` rather than picked
 * by eye: the green is #3D7E34, taken from the button fill and confirmed against
 * the icon glyphs at #3E7A33. The card is #FEFEFE, which is also the background
 * `account-top.png` was exported against — that image ships opaque, so tinting
 * the card any further shows the hero as a rectangle.
 *
 * Strings only, no components: this file is imported by three panels, and a .tsx
 * that exports both would trip react-refresh/only-export-components.
 */

export const GREEN = '#3D7E34';

/** The card itself. Border matches DonatePanel's, which is the same family. */
export const card =
  'mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl ' +
  'border-2 border-[#B7DBB8] bg-[#FEFEFE] px-6 py-6 shadow-xl';

export const backdrop =
  'no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40';

export const heading = 'mt-1 text-center text-4xl font-extrabold tracking-tight text-[#111F1F]';

/** The one-line status under the heading. Green because it is never bad news. */
export const status = 'mt-1 text-center text-xl font-bold text-[#3D7E34]';

export const blurb = 'mt-2 text-center text-lg leading-snug text-[#495668]';

export const label = 'mb-1.5 block text-sm font-bold text-[#1F293D]';

export const field =
  'w-full rounded-lg border border-[#D8DEE4] bg-white px-3.5 py-3 text-lg text-[#1F293D] ' +
  'placeholder:text-[#7F8497] focus:border-[#3D7E34] focus:outline-none focus:ring-2 focus:ring-[#3D7E34]/30';

export const primary =
  'w-full rounded-lg bg-[#3D7E34] px-4 py-3.5 text-lg font-bold text-white transition-colors ' +
  'hover:bg-[#336B2B] disabled:cursor-not-allowed disabled:bg-[#AFC9AA]';

export const secondary =
  'w-full rounded-lg border border-[#D8DEE4] bg-[#F7F7F8] px-4 py-3 text-lg font-medium ' +
  'text-[#3A4353] transition-colors hover:bg-[#EDF0F4] disabled:cursor-not-allowed disabled:opacity-60';

/**
 * An account action, shaped like SharePanel's buttons: a title with a quieter
 * line under it saying what actually happens. Two of these read as a list, which
 * is what stops Change email, Sign out and Close from being three identical grey
 * slabs — the complaint that started this rebuild.
 */
export const row =
  'flex w-full items-center gap-3 rounded-lg border border-[#D8DEE4] bg-white px-4 py-3 ' +
  'text-left transition-colors hover:bg-[#F1F3F6] disabled:cursor-not-allowed disabled:opacity-60';

export const rowTitle = 'block font-bold text-[#1F293D]';
export const rowNote = 'block text-sm text-[#6B7684]';

/** The sync note and its siblings. Colour is set per state by the caller. */
export const note = 'mt-4 rounded-xl border px-3.5 py-3';

export const muted = 'mt-3 flex items-center justify-center gap-2 text-center text-sm text-[#69727F]';
