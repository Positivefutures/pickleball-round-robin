import type { Gender, Player } from '../types';

/**
 * The practice group a fresh install opens with, and the one the tutorial
 * plays in.
 *
 * Twenty-four people is enough for every feature to demonstrate itself: six
 * full courts, sit-outs when there are fewer, and an even split of men and
 * women so gendered and mixed rounds have something to chew on. The ratings
 * run 3.0 to 4.5 in the same one-decimal steps the rating control uses, so
 * editing a sample player never lands on a value the stepper cannot reach.
 *
 * The names are deliberately plain — first name and last initial, the way a
 * host would actually type them.
 */
export const EXAMPLE_GROUP_NAME = 'Example Group';

/**
 * What the fresh-install seed wrote, recorded so sync can recognise a device
 * that still holds nothing but the example. See untouchedExampleInstall() in
 * sync.ts — a first sign-in on such a device takes the account copy silently
 * instead of asking a merge question about players nobody made.
 */
export interface ExampleMeta {
  rosterId: string;
  playerIds: string[];
}

export const EXAMPLE_ROSTER: { name: string; rating: number; gender: Gender }[] = [
  { name: 'Ben T.', rating: 3.0, gender: 'M' },
  { name: 'Tom A.', rating: 3.1, gender: 'M' },
  { name: 'Carlos R.', rating: 3.2, gender: 'M' },
  { name: 'Nate W.', rating: 3.3, gender: 'M' },
  { name: 'David K.', rating: 3.5, gender: 'M' },
  { name: 'Eric S.', rating: 3.5, gender: 'M' },
  { name: 'Frank O.', rating: 3.6, gender: 'M' },
  { name: 'Greg H.', rating: 3.8, gender: 'M' },
  { name: 'James L.', rating: 4.0, gender: 'M' },
  { name: 'Kevin B.', rating: 4.0, gender: 'M' },
  { name: 'Mike D.', rating: 4.2, gender: 'M' },
  { name: 'Paul G.', rating: 4.5, gender: 'M' },
  { name: 'Amy C.', rating: 3.0, gender: 'F' },
  { name: 'Tina H.', rating: 3.1, gender: 'F' },
  { name: 'Beth R.', rating: 3.2, gender: 'F' },
  { name: 'Nancy E.', rating: 3.3, gender: 'F' },
  { name: 'Carol M.', rating: 3.5, gender: 'F' },
  { name: 'Diane P.', rating: 3.5, gender: 'F' },
  { name: 'Emma J.', rating: 3.6, gender: 'F' },
  { name: 'Karen S.', rating: 3.8, gender: 'F' },
  { name: 'Grace F.', rating: 4.0, gender: 'F' },
  { name: 'Maria G.', rating: 4.0, gender: 'F' },
  { name: 'Linda V.', rating: 4.2, gender: 'F' },
  { name: 'Sarah M.', rating: 4.5, gender: 'F' },
];

/**
 * The twenty-four sample players, freshly minted for one roster.
 *
 * Ids come from the caller so the migration and the tutorial's temporary group
 * can each hand in generateId(). Always fresh, never matched against existing
 * players by name — a host may genuinely have a Sarah M. of their own, and she
 * must not be pulled into a group that gets deleted when the tutorial ends.
 */
export function buildExamplePlayers(rosterId: string, newId: () => string): Player[] {
  return EXAMPLE_ROSTER.map((entry) => ({
    id: newId(),
    name: entry.name,
    rating: entry.rating,
    gender: entry.gender,
    rosterIds: [rosterId],
  }));
}
