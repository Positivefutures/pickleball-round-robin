import type { Partnership } from '../types';

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

// Drops any partnership that references a player no longer in `validIds`.
export function prunePartnerships(
  partnerships: Partnership[],
  validIds: Set<string>
): Partnership[] {
  return partnerships.filter(
    (p) => validIds.has(p.player1Id) && validIds.has(p.player2Id)
  );
}
