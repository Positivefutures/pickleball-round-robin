import type { Partnership, Player } from '../types';

// A stable key for a pair of player ids, order-independent, so two players are
// looked up the same way regardless of which was tapped first.
export function partnerKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
}

// The set of every player id that belongs to some partnership.
export function partneredIds(partnerships: Partnership[]): Set<string> {
  const ids = new Set<string>();
  for (const p of partnerships) {
    ids.add(p.player1Id);
    ids.add(p.player2Id);
  }
  return ids;
}

// Map from a player id to their partner's id (undefined if unpaired).
export function partnerOf(partnerships: Partnership[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of partnerships) {
    map.set(p.player1Id, p.player2Id);
    map.set(p.player2Id, p.player1Id);
  }
  return map;
}

// Whether two specific players are partners.
export function arePartners(
  id1: string,
  id2: string,
  partnerships: Partnership[]
): boolean {
  return partnerships.some(
    (p) =>
      (p.player1Id === id1 && p.player2Id === id2) ||
      (p.player1Id === id2 && p.player2Id === id1)
  );
}

// Resolves partnerships against a set of players, keeping only the pairs whose
// two members are both present. A partnership survives in storage while one of
// its members is deselected, but it isn't an active pair until both are back.
export function resolvePairs(
  partnerships: Partnership[],
  players: Player[]
): { p1: Player; p2: Player }[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return partnerships
    .map((pr) => ({ p1: byId.get(pr.player1Id), p2: byId.get(pr.player2Id) }))
    .filter((pr): pr is { p1: Player; p2: Player } => !!pr.p1 && !!pr.p2);
}

// Drops any partnership that references a player no longer in `validIds`.
export function prunePartnerships(
  partnerships: Partnership[],
  validIds: Set<string>
): Partnership[] {
  return partnerships.filter(
    (p) => validIds.has(p.player1Id) && validIds.has(p.player2Id)
  );
}

/**
 * The couples in force for the afternoon: the standing ones from Setup, with
 * any a substitute has taken over laid on top.
 *
 * A stand-in wins. If Dave has a partner of his own in Setup and then subs in
 * beside Ann, he plays with Ann for the rest of the day: that is the seat the
 * host has just put him in, and it is the padlock on the screen in front of
 * them. His own couple is not deleted, only set aside — it is still in Setup,
 * and it is back next week.
 *
 * Order matters to the scheduler, which claims players pair by pair and skips
 * any couple whose members are already claimed. The stand-ins go first so they
 * are the ones that claim.
 */
export function withSubbedPairs(
  base: Partnership[],
  subbed: Partnership[]
): Partnership[] {
  if (subbed.length === 0) return base;
  const claimed = new Set(subbed.flatMap((p) => [p.player1Id, p.player2Id]));
  return [
    ...subbed,
    ...base.filter((p) => !claimed.has(p.player1Id) && !claimed.has(p.player2Id)),
  ];
}

/**
 * One player stands in for another, and inherits whoever they were linked to.
 *
 * Returns the new stand-in list, which is session-scoped: the couple in Setup is
 * left exactly as it is, because covering for a twisted ankle is not a decision
 * about who somebody's partner is.
 *
 * The pair is read off the list already in force rather than off Setup, so a
 * second substitution carries the first one forward: Jeff goes off and Dave
 * takes his place beside Ann, then Dave goes off and Ed takes his, and Ed is
 * playing with Ann. Every earlier entry naming any of the three is dropped, so
 * one player is never left standing in two couples.
 */
export function transferPartnership(
  subbed: Partnership[],
  base: Partnership[],
  outgoingId: string,
  incomingId: string
): Partnership[] {
  const inForce = withSubbedPairs(base, subbed);
  const pair = inForce.find(
    (p) => p.player1Id === outgoingId || p.player2Id === outgoingId
  );
  // Nobody linked to the player going off, so there is nothing to hand over.
  // Anything the incoming player was already standing in for still goes, or
  // they would arrive carrying a couple from a seat they have since left.
  const partnerId = pair
    ? pair.player1Id === outgoingId
      ? pair.player2Id
      : pair.player1Id
    : null;

  const kept = subbed.filter(
    (p) =>
      ![p.player1Id, p.player2Id].some(
        (id) => id === outgoingId || id === incomingId || id === partnerId
      )
  );
  if (!partnerId) return kept.length === subbed.length ? subbed : kept;

  // Written the way round the couple already read, so the pair the host set up
  // does not appear to have turned itself around because somebody went home.
  return [
    ...kept,
    pair!.player1Id === outgoingId
      ? { player1Id: incomingId, player2Id: partnerId }
      : { player1Id: partnerId, player2Id: incomingId },
  ];
}
