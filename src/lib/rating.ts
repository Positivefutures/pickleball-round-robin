/**
 * The bounds every rating control in the app moves between.
 *
 * Three separate copies of 3, 5 and 0.1 used to live in the Add Player form, the
 * Default Player Rating panel and the CSV reader, with a comment in each saying
 * it matched the others. This is that comment made true.
 */
export const MIN_RATING = 3;
export const MAX_RATING = 5;

/** Nudges a rating, rounded so floating point never leaves a 3.7000000000000006. */
export function step(rating: number, by: number): number {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round((rating + by) * 10) / 10));
}
