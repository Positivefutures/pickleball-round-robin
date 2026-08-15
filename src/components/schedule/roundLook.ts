/**
 * The colours and type sizes a round is built out of, in one place because
 * three files need them.
 *
 * `RoundCard` paints the card and `CourtMatchup` paints the white panels sitting
 * on it, and the line around both is the same line. Strings only, no components,
 * so nothing here can trip react-refresh — the same reason `accountStyles.ts`
 * is a `.ts` and not a `.tsx`.
 */

/** The card behind a round. */
export const ROUND_FILL = '#7CAED0';

/**
 * The line around the card, and around each court on it.
 *
 * 2px rather than a hairline: it has to hold its own against the fill on one
 * side and white on the other, and at 1px it read as an artefact of the two
 * meeting rather than as a drawn edge.
 */
export const ROUND_EDGE = '#2B76A9';

/**
 * The same line, several steps down, worn for two seconds by a sit-out chip
 * somebody has just been swapped into. The courts do this in their own two
 * colours; out here there is only the round's line to darken.
 */
export const ROUND_EDGE_SWAPPED = '#0E3E5D';

/**
 * The line around a player's box, one colour per side.
 *
 * Tailwind's blue-200 and orange-200 with every channel taken down a fifth,
 * which is Jeff's "20% darker" on 2026-08-15. The fills stay where they are: it
 * is the edge that had to hold, and darkening the box behind the name would
 * start to fight the name.
 *
 * Written as whole class names rather than built from a hex, because Tailwind
 * only generates a utility it can see spelled out in a file.
 */
export const TEAM1_EDGE = 'border-[#99afcb]';
export const TEAM2_EDGE = 'border-[#cbac88]';

/**
 * What a round says about itself: ROUND 3, COURT 1, COMPLETED.
 *
 * All three are the same size because they are the same kind of thing, and a
 * court read at arm's length is found by its number before anything else.
 * Absolute rather than a scaling class, so the size is the size in both text
 * modes. Large-text mode already drew the round number and the court number at
 * exactly this, so it is the ordinary mode that has caught up.
 */
export const ROUND_HEADING_TEXT = 'text-[1.35rem]';

/**
 * A player's name, on a court and in the sit-out list.
 *
 * Absolute for the same reason, and set to what `text-sm` comes out at in
 * large-text mode: 0.875rem x 1.35. Large text is untouched and the ordinary
 * mode has caught up with it. This is the line somebody reads with a phone at
 * arm's length, and it was the smallest thing on the page that mattered most.
 *
 * The rating beside it stays on `text-sm` and goes on scaling. It is a number
 * you check, not one you read across a court.
 */
export const PLAYER_NAME_TEXT = 'text-[1.18125rem]';
