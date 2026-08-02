import type { Player } from '../types';
import type { ImportRow } from './groupFile';

export interface ImportGroup {
  rosterId: string;
  rows: ImportRow[];
}

export interface ImportCounts {
  /** New to this device, created by the file. */
  added: number;
  /** Already in the pool before the import, linked into this group. */
  linked: number;
}

export interface ImportPlan {
  /** Players to append to the pool. */
  created: Player[];
  /** Extra roster ids for players already in the pool, by player id. */
  links: Map<string, string[]>;
  /** One entry per group, in the order given. */
  counts: ImportCounts[];
}

/**
 * Works out what an imported file does to the player pool, for every group at
 * once. Kept pure and separate from the hook so this — the fiddly part — can be
 * tested without a React tree.
 *
 * All groups are planned together on purpose. Doing one group at a time against
 * React state would have each group after the first read a pool that had not
 * caught up yet, so a player listed in two groups would be created twice
 * instead of joining both. An all-groups export is full of exactly that case.
 *
 * Matching is by name, case- and padding-insensitive. A name already in the
 * pool keeps its existing rating and gender: the file only supplies those for
 * people it introduces.
 */
export function planImport(
  players: Player[],
  groups: ImportGroup[],
  newId: () => string
): ImportPlan {
  const idByName = new Map(players.map((p) => [p.name.trim().toLowerCase(), p.id]));
  const createdByName = new Map<string, Player>();
  const links = new Map<string, Set<string>>();
  const counts: ImportCounts[] = [];

  for (const { rosterId, rows } of groups) {
    let added = 0;
    let linked = 0;

    for (const row of rows) {
      const key = row.name.trim().toLowerCase();
      const existingId = idByName.get(key);

      if (existingId === undefined) {
        const player: Player = {
          id: newId(),
          name: row.name,
          rating: row.rating,
          gender: row.gender,
          rosterIds: [rosterId],
        };
        createdByName.set(key, player);
        idByName.set(key, player.id);
        added++;
        continue;
      }

      // Introduced by an earlier group in this same file: extend that player
      // rather than counting them against the pool that existed beforehand.
      const fresh = createdByName.get(key);
      if (fresh) {
        if (!fresh.rosterIds.includes(rosterId)) fresh.rosterIds.push(rosterId);
        added++;
      } else {
        const set = links.get(existingId) ?? new Set<string>();
        set.add(rosterId);
        links.set(existingId, set);
        linked++;
      }
    }

    counts.push({ added, linked });
  }

  return {
    created: [...createdByName.values()],
    links: new Map([...links].map(([id, set]) => [id, [...set]])),
    counts,
  };
}
