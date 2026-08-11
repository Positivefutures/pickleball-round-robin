/**
 * The colours a round is built out of, in one place because two files need them.
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
