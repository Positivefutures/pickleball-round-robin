import type { RoundType } from '../types';
import { ROUND_TYPES } from './roundTypes';

/**
 * The retired "every N rounds" machine. **The only caller is runMigrations().**
 *
 * Hosts used to set a frequency per type — gendered every 4 rounds — and this
 * worked out which rounds those landed on, resolving two falling due together
 * by rarity and then by the host's own ordering. It is replaced by the host
 * saying it outright, one row per round: see lib/roundPlan.ts.
 *
 * It is kept, whole and working, because it is now the input to the migration
 * that derives a host's first plan from what they had already set. It lives in
 * a file of its own rather than behind a scattering of `@deprecated`, so that
 * "what still uses the old machine" is one grep and the answer stays one file.
 *
 * `pb-special-types` is still in localStorage and still written to sync for
 * this release, so a rollback finds the host's settings where it left them.
 * Nothing but the migration reads it.
 */

export interface SpecialTypeSetting {
  enabled: boolean;
  /** Play this type every N rounds. */
  frequency: number;
  /**
   * Where the host had placed this type in the panel, 0 first. Settled which
   * type took a round two of them both fell due on.
   */
  order: number;
}

export type SpecialGameTypes = Record<RoundType, SpecialTypeSetting>;

/** The most rounds a type could be spaced out by. */
export const MAX_FREQUENCY = 8;

export const DEFAULT_SPECIAL_TYPES: SpecialGameTypes = {
  gendered: { enabled: false, frequency: 2, order: 0 },
  mixed: { enabled: false, frequency: 2, order: 1 },
  skill: { enabled: false, frequency: 2, order: 2 },
};

/** The three types in the host's chosen order. */
export function orderedTypes(cfg: SpecialGameTypes): RoundType[] {
  return [...ROUND_TYPES].sort((a, b) => rankOf(cfg, a) - rankOf(cfg, b));
}

/** Enabled types, in the host's chosen order. */
export function enabledTypes(cfg: SpecialGameTypes): RoundType[] {
  return orderedTypes(cfg).filter((t) => cfg[t].enabled);
}

// A config stored by v1.40.0 has no `order` at all. Fall back to the listed
// order so those settings sort sensibly until normalize writes real ones in.
function rankOf(cfg: SpecialGameTypes, type: RoundType): number {
  const order = cfg[type]?.order;
  return typeof order === 'number' ? order : ROUND_TYPES.indexOf(type);
}

/**
 * Pulls a config back into shape: every frequency in range, and the order a
 * clean 0, 1, 2 with no gaps or duplicates. Run over anything read from
 * storage before it is planned from.
 */
export function normalizeSpecialTypes(cfg: SpecialGameTypes): SpecialGameTypes {
  const ranked = orderedTypes(cfg);
  const next = {} as SpecialGameTypes;
  for (const t of ROUND_TYPES) {
    next[t] = {
      ...cfg[t],
      frequency: Math.min(MAX_FREQUENCY, Math.max(1, cfg[t].frequency)),
      order: ranked.indexOf(t),
    };
  }
  return next;
}

/**
 * Works out which type, if any, each round is played in.
 *
 * "Every N rounds" means the Nth round, then every N after it: every 4 is
 * rounds 4 and 8, not 1 and 5. When two fall due on the same round the rarer
 * one — the bigger frequency — takes it, because it has fewer chances to happen
 * at all. The one that lost slides to the very next round and counts from
 * there, so it still gets its share rather than being skipped. Rounds nobody
 * claims are ordinary round robin.
 *
 * Gendered every 4 with mixed every 2 gives:
 * normal, mixed, normal, gendered, normal, mixed, normal, gendered.
 */
export function planRoundTypes(
  cfg: SpecialGameTypes,
  numRounds: number
): (RoundType | null)[] {
  const active = enabledTypes(cfg);
  /**
   * Each type falls due after it has waited its frequency out, so "every 4
   * rounds" first lands on round 4.
   *
   * It used to be due in round 1, which made every session open on a special
   * game and read as "one now, then every 4". Jeff's call on 2026-08-15: asking
   * for a gendered round every four rounds is asking for the fourth one, and a
   * session that opens on one has not waited for anything.
   *
   * The cost is that a session shorter than the frequency gets none at all,
   * which is the honest answer — Setup said so, in as many words, rather than
   * quietly playing one in round 1.
   */
  const nextDue = new Map(active.map((t) => [t, cfg[t].frequency]));
  const played = new Map(active.map((t) => [t, 0]));
  const plan: (RoundType | null)[] = [];

  for (let r = 1; r <= numRounds; r++) {
    const due = active.filter((t) => (nextDue.get(t) ?? Infinity) <= r);
    if (due.length === 0) {
      plan.push(null);
      continue;
    }

    // Rarest type first, then whoever has waited longest, then whoever has had
    // fewer turns, and the host's own order settles what is left. Turns must
    // outrank the host's order: put their order above it and whichever type
    // sits on top wins every tie for the whole session, starving the others.
    due.sort(
      (a, b) =>
        cfg[b].frequency - cfg[a].frequency ||
        (nextDue.get(a) ?? 0) - (nextDue.get(b) ?? 0) ||
        (played.get(a) ?? 0) - (played.get(b) ?? 0) ||
        rankOf(cfg, a) - rankOf(cfg, b)
    );

    const [winner, ...bumped] = due;
    plan.push(winner);
    played.set(winner, (played.get(winner) ?? 0) + 1);
    nextDue.set(winner, r + cfg[winner].frequency);
    for (const t of bumped) nextDue.set(t, r + 1);
  }

  return plan;
}
