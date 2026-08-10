import type { CourtAssignment, Round, RoundType, SpecialGameTypes } from '../types';

/** The three types. The host's own order lives in each setting's `order`. */
export const ROUND_TYPES: RoundType[] = ['gendered', 'mixed', 'skill'];

/** The most rounds a type can be spaced out by. */
export const MAX_FREQUENCY = 8;

export const DEFAULT_SPECIAL_TYPES: SpecialGameTypes = {
  gendered: { enabled: false, frequency: 2, order: 0 },
  mixed: { enabled: false, frequency: 2, order: 1 },
  skill: { enabled: false, frequency: 2, order: 2 },
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
 * clean 0, 1, 2 with no gaps or duplicates. Run after any change to the config,
 * and over anything read from storage.
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

/** Moves a type one place up (-1) or down (1). At either end, nothing happens. */
export function moveType(
  cfg: SpecialGameTypes,
  type: RoundType,
  direction: -1 | 1
): SpecialGameTypes {
  const ranked = orderedTypes(cfg);
  const from = ranked.indexOf(type);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ranked.length) return cfg;

  const swapped = [...ranked];
  swapped[from] = ranked[to];
  swapped[to] = ranked[from];

  const next = {} as SpecialGameTypes;
  for (const t of ROUND_TYPES) {
    next[t] = { ...cfg[t], order: swapped.indexOf(t) };
  }
  return next;
}

/**
 * Works out which type, if any, each round is played in.
 *
 * Every switched-on type wants round 1, then another every `frequency` rounds.
 * When two fall due on the same round the rarer one — the bigger frequency —
 * takes it, because it has fewer chances to happen at all. The one that lost
 * slides to the very next round and counts from there, so it still gets its
 * share rather than being skipped. Rounds nobody claims are ordinary round
 * robin.
 *
 * Gendered every 4 with mixed every 2 gives:
 * gendered, mixed, normal, mixed, gendered, mixed, normal, mixed.
 */
export function planRoundTypes(
  cfg: SpecialGameTypes,
  numRounds: number
): (RoundType | null)[] {
  const active = enabledTypes(cfg);
  // Everything is due in round 1, so a session always opens on a game type and
  // a short session still gets one. "Every 4 rounds" means 1, 5, 9 — not 4, 8.
  const nextDue = new Map(active.map((t) => [t, 1]));
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

export interface SpecialSummary {
  type: RoundType;
  /** "Gendered every 4 rounds" */
  headline: string;
  /** The rounds it actually lands on this session. Empty if it never fits. */
  rounds: number[];
}

/**
 * What Setup reads back. The round numbers come from the plan itself rather
 * than being worked out again here, so the preview cannot drift from what
 * Generate builds.
 */
export function specialSummary(
  cfg: SpecialGameTypes,
  numRounds: number
): SpecialSummary[] {
  const plan = planRoundTypes(cfg, numRounds);
  return enabledTypes(cfg).map((t) => {
    const n = cfg[t].frequency;
    const every = n === 1 ? 'every round' : `every ${n} rounds`;
    return {
      type: t,
      headline: `${ROUND_TYPE_META[t].shortName} ${every}`,
      rounds: plan.flatMap((x, i) => (x === t ? [i + 1] : [])),
    };
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

/**
 * Did this court actually get played in the round's format? A roster rarely
 * divides evenly into the format, so a special round fills the courts it can
 * and plays the rest as an ordinary game. Both the schedule and the printout
 * mark those courts, and `updateSpecialMissCounts` puts the players on them
 * first in the queue next time.
 */
export function courtMatchesType(court: CourtAssignment, type: RoundType): boolean {
  const teams = [court.team1, court.team2];
  // A court the roster could not fill plays an ordinary game whatever the round
  // is. A 2v1 cannot be mixed, and calling it gendered or equal-skill would be
  // a technicality — nobody standing there is playing the format.
  if (court.team1.length + court.team2.length < 4) return false;
  switch (type) {
    case 'gendered':
      return new Set([...court.team1, ...court.team2].map((p) => p.gender)).size === 1;
    case 'mixed':
      return teams.every((t) => t.length === 2 && t[0].gender !== t[1].gender);
    case 'skill':
      // Every court in a skill round is a rating band by construction.
      return true;
  }
}
