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
 * The same card and the same line once the round is finished.
 *
 * A round that is done is still worth finding on the page and no longer worth
 * looking at, and until now it said so only by folding shut. Stacked up at the
 * top of a long session, the finished ones read exactly as loud as the round
 * being played — same blue, same weight — so the eye had to read the numbers to
 * find the live one. These are the same colours lifted and drained: the fill
 * comes up towards white, the line comes with it so the edge does not end up
 * the loudest thing on a quiet card, and both keep enough blue to still belong
 * to the round above them rather than looking like a different component.
 *
 * Jeff's brief on 2026-08-20: lighter, less colourful, a little washed out,
 * with the live rounds left exactly as they are.
 */
export const ROUND_FILL_DONE = '#CBDCE7';
export const ROUND_EDGE_DONE = '#A3C0D3';

/**
 * What is printed on a finished card, in place of white.
 *
 * White is what the live card uses, and on a fill this pale it would be all but
 * gone — the wash has to come off the card, not off the writing, or a host
 * cannot read which round they are looking at. A slate out of the same blue
 * family reads as quiet without disappearing, and it is a genuine improvement
 * on the live card it copies: white on #7CAED0 is about 2.1:1, and this is
 * about 5.4:1.
 *
 * A whole class name rather than a hex, for the reason TEAM1_EDGE gives above.
 */
export const ROUND_TEXT_DONE = 'text-[#41566B]';

/**
 * The DONE pill on a watcher's finished round, and the underline on a link
 * printed on one.
 *
 * Both are the ink at a fraction, written out with the hex rather than as
 * `current/15`, for the same reason the ink itself is: Tailwind generates what
 * it can see spelled out. The live card keeps its own white pair below, so a
 * round that is still being played looks exactly as it did.
 */
export const ROUND_PILL_DONE = 'bg-[#41566B]/15';
export const ROUND_RULE_DONE = 'decoration-[#41566B]/50';
export const ROUND_RULE_LIVE = 'decoration-white/50';

/**
 * The same line, several steps down, worn for two seconds by a sit-out chip
 * somebody has just been swapped into. The courts do this in their own two
 * colours; out here there is only the round's line to darken.
 */
export const ROUND_EDGE_SWAPPED = '#0E3E5D';

/**
 * And the fill under it for those same two seconds: the blue a chip wears while
 * it is selected, fading back to its resting grey.
 *
 * Named as the theme variable rather than a hex, because that is literally what
 * `bg-blue-100` compiles to — Tailwind v4 keeps its palette in OKLCH and the
 * old hex for blue-100 is no longer the colour on the screen. Pointing at the
 * variable means the fade starts on exactly the shade the selected chip was
 * wearing a moment ago, whatever that shade becomes.
 */
export const SITOUT_FILL_SWAPPED = 'var(--color-blue-100)';

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
 * What a round says about itself: ROUND 3, COURT 1, DONE.
 *
 * All three are the same size because they are the same kind of thing, and a
 * court read at arm's length is found by its number before anything else.
 * Absolute rather than a scaling class, so the size is the size in both text
 * modes. Large-text mode already drew the round number and the court number at
 * exactly this, so it is the ordinary mode that has caught up.
 */
export const ROUND_HEADING_TEXT = 'text-[1.35rem]';

/**
 * The clock on a round's header, and the time left beside it once one is
 * running.
 *
 * Here rather than in either component because the host's card and a watcher's
 * card draw the same thing from two different sources — a live store on one
 * side, a published document on the other — and the two must not drift apart.
 *
 * The digits sit at the heading's own size, which is also DONE's: all three are
 * things read off the top of a card at arm's length, so all three are one size.
 *
 * The ink is the caller's, not this string's. A watcher's page draws a clock on
 * every round including the finished ones, and a finished card is pale now, so
 * `text-white` baked in here would have put a white clock on a near-white card.
 * Ordering two colour utilities in one attribute does not settle which wins —
 * the generated stylesheet does — so the colour has to come from outside rather
 * than be overridden.
 */
export const ROUND_TIMER_CHIP =
  'no-print flex shrink-0 items-center gap-1.5 transition-opacity hover:opacity-75';

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
