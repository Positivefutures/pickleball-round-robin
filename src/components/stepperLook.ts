/**
 * What a stepper looks like, in one place because two of them are in the app
 * and they were drawn years apart.
 *
 * `SessionConfig` set courts and rounds from `INBOX/Setup-Round-Robin.png`: pale
 * keys with teal glyphs, and the number between them in its own ruled box. The
 * rating stepper was older and plainer, grey keys and a bare number, and the two
 * sitting a tab apart read as two different controls doing the same job.
 *
 * Only the colours are shared. Sizes stay with the caller: the rating stepper
 * lives on a crowded row beside a name field and a Gender toggle, and has
 * nothing like the room the two big numbers on Setup have.
 */

/** The line around a key, and above and below the number. Mockup: #CCCFD9. */
export const STEPPER_EDGE = '#CCCFD9';

/** The number itself, and the labels over it. Mockup: #0D1F44. */
export const STEPPER_INK = '#0D1F44';

/**
 * A key: pale fill, teal glyph, one line around it.
 *
 * Keys stay live at the ends of their range and clamp. A key that greys out at
 * 1 court reads as something being wrong rather than as the floor being reached.
 */
export const STEPPER_KEY =
  'flex items-center justify-center rounded-lg border border-[#CCCFD9] bg-[#FAFAFA] ' +
  'text-brand-teal font-bold transition-colors hover:bg-[#EFF0F2]';

/**
 * The number between the keys: light teal, ruled top and bottom only.
 *
 * The same tint a rating wears on the players list. Square, and tucked a little
 * way under the key on each side by the caller, so what you see is one bar
 * running behind two keys rather than three boxes in a row.
 */
export const STEPPER_VALUE =
  'flex items-center justify-center border-y border-[#CCCFD9] bg-brand-teal-light ' +
  'text-[#0D1F44] font-bold';
