import type { Round, RoundType, SpecialGameTypes } from '../types';

/**
 * The order the three types are offered in, and the tie-break order when two of
 * them want the same round.
 */
export const ROUND_TYPES: RoundType[] = ['gendered', 'mixed', 'skill'];

/** The most rounds a type can be spaced out by. */
export const MAX_FREQUENCY = 8;

export const DEFAULT_SPECIAL_TYPES: SpecialGameTypes = {
  gendered: { enabled: false, frequency: 2 },
  mixed: { enabled: false, frequency: 2 },
  skill: { enabled: false, frequency: 2 },
};

interface RoundTypeMeta {
  /** Heading in the Special Game Types panel. */
  title: string;
  /** One line under the heading saying what the format is. */
  description: string;
  /** Read-only summary on Setup, and the badge on the schedule. */
  shortName: string;
  badge: string;
  badgeClass: string;
  printColor: string;
}

export const ROUND_TYPE_META: Record<RoundType, RoundTypeMeta> = {
  gendered: {
    title: 'Gendered Games',
    description: 'Men play men and women play women.',
    shortName: 'Gendered',
    badge: 'Gendered Round',
    badgeClass: 'bg-purple-100 text-purple-700',
    printColor: '#7e22ce',
  },
  mixed: {
    title: 'Mixed Games',
    description: 'One man and one woman on each team.',
    shortName: 'Mixed',
    badge: 'Mixed Round',
    badgeClass: 'bg-teal-100 text-teal-700',
    printColor: '#0f766e',
  },
  skill: {
    title: 'Equal Skill Level Games',
    description: 'You play with and against people near your own level.',
    shortName: 'Equal Skill',
    badge: 'Equal Skill Round',
    badgeClass: 'bg-amber-100 text-amber-800',
    printColor: '#b45309',
  },
};

export function enabledTypes(cfg: SpecialGameTypes): RoundType[] {
  return ROUND_TYPES.filter((t) => cfg[t].enabled);
}

/**
 * Two types cannot both happen every round, and three cannot both happen every
 * other round, so the floor on every frequency is however many are switched on.
 */
export function minFrequency(cfg: SpecialGameTypes): number {
  return Math.max(1, enabledTypes(cfg).length);
}

/** Pulls every frequency back into range. Run this after any change to the config. */
export function normalizeSpecialTypes(cfg: SpecialGameTypes): SpecialGameTypes {
  const min = minFrequency(cfg);
  const next = {} as SpecialGameTypes;
  for (const t of ROUND_TYPES) {
    const frequency = Math.min(MAX_FREQUENCY, Math.max(min, cfg[t].frequency));
    next[t] = frequency === cfg[t].frequency ? cfg[t] : { ...cfg[t], frequency };
  }
  return next;
}

/**
 * Works out which type, if any, each round is played in.
 *
 * Every switched-on type is due again `frequency` rounds after it last played.
 * When two fall due on the same round the rarer one — the bigger frequency —
 * takes it, because it has fewer chances to happen at all. The one that lost
 * slides to the very next round and counts from there, so it still gets its
 * share rather than being skipped. Rounds nobody claims are ordinary round
 * robin.
 *
 * Gendered every 4 with mixed every 2 gives:
 * normal, mixed, normal, gendered, mixed, normal, mixed, gendered.
 */
export function planRoundTypes(
  cfg: SpecialGameTypes,
  numRounds: number
): (RoundType | null)[] {
  const active = enabledTypes(cfg);
  const nextDue = new Map(active.map((t) => [t, cfg[t].frequency]));
  const plan: (RoundType | null)[] = [];

  for (let r = 1; r <= numRounds; r++) {
    const due = active.filter((t) => (nextDue.get(t) ?? Infinity) <= r);
    if (due.length === 0) {
      plan.push(null);
      continue;
    }

    // Rarest type first, then whoever has been waiting longest, then a fixed
    // order so the same settings always produce the same plan.
    due.sort(
      (a, b) =>
        cfg[b].frequency - cfg[a].frequency ||
        (nextDue.get(a) ?? 0) - (nextDue.get(b) ?? 0) ||
        ROUND_TYPES.indexOf(a) - ROUND_TYPES.indexOf(b)
    );

    const [winner, ...bumped] = due;
    plan.push(winner);
    nextDue.set(winner, r + cfg[winner].frequency);
    for (const t of bumped) nextDue.set(t, r + 1);
  }

  return plan;
}

/** "Gendered every 4 rounds", one line per type switched on. */
export function summaryLines(cfg: SpecialGameTypes): string[] {
  return enabledTypes(cfg).map((t) => {
    const n = cfg[t].frequency;
    const every = n === 1 ? 'every round' : `every ${n} rounds`;
    return `${ROUND_TYPE_META[t].shortName} ${every}`;
  });
}

/**
 * The type a round was built as. Schedules saved before this feature only have
 * the old `isGendered` flag, so everything reads rounds through here.
 */
export function roundTypeOf(round: Round): RoundType | null {
  if (round.roundType) return round.roundType;
  return round.isGendered ? 'gendered' : null;
}
