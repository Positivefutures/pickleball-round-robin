import type { Gender, Player } from '../types';

/**
 * The practice group a fresh install opens with: something to try before
 * there is anything to type.
 *
 * Fourteen people, which is the number the first-run tour asks for by name: it
 * says Select All, and fourteen on the default three courts fills twelve seats
 * and sits two out. So the very first schedule anybody sees has a sit-out list
 * on it, which is the part of this app that is hardest to guess at.
 *
 * Seven men and seven women, so gendered and mixed rounds have something to
 * chew on. The two ratings ladders mirror each other and run 3.0 to 4.5 in the
 * same one-decimal steps the rating control uses, so editing a sample player
 * never lands on a value the stepper cannot reach.
 *
 * It was twenty-four before the tour existed. Devices seeded then keep their
 * twenty-four; only new seeds are fourteen, and exampleMeta records what was
 * actually written rather than assuming a count.
 *
 * The names are deliberately plain — first name and last initial, the way a
 * host would actually type them.
 */
export const EXAMPLE_GROUP_NAME = 'Sample Group';

/**
 * What the seed called it before the rename to Sample Group. Devices seeded
 * then still hold a group under the old name, and sync has to keep recognising
 * it — see untouchedExampleInstall() in sync.ts, which would otherwise start
 * asking those hosts a merge question about players nobody made.
 */
export const LEGACY_EXAMPLE_GROUP_NAME = 'Example Group';

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
  { name: 'Carlos R.', rating: 3.2, gender: 'M' },
  { name: 'David K.', rating: 3.5, gender: 'M' },
  { name: 'Frank O.', rating: 3.6, gender: 'M' },
  { name: 'Greg H.', rating: 3.8, gender: 'M' },
  { name: 'Kevin B.', rating: 4.0, gender: 'M' },
  { name: 'Paul G.', rating: 4.5, gender: 'M' },
  { name: 'Amy C.', rating: 3.0, gender: 'F' },
  { name: 'Beth R.', rating: 3.2, gender: 'F' },
  { name: 'Carol M.', rating: 3.5, gender: 'F' },
  { name: 'Emma J.', rating: 3.6, gender: 'F' },
  { name: 'Karen S.', rating: 3.8, gender: 'F' },
  { name: 'Grace F.', rating: 4.0, gender: 'F' },
  { name: 'Sarah M.', rating: 4.5, gender: 'F' },
];

/**
 * The twenty-four sample players, freshly minted for one roster.
 *
 * Ids come from the caller, which hands in generateId(). Always fresh, never
 * matched against existing players by name — a host may genuinely have a
 * Sarah M. of their own, and she is not one of the samples.
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
