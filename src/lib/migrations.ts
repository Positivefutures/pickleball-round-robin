import type { Player, Roster } from '../types';
import type { SpecialGameTypes } from './legacySpecialTypes';
import { generateId } from '../utils/helpers';
import {
  DEFAULT_SPECIAL_TYPES,
  normalizeSpecialTypes,
  planRoundTypes,
} from './legacySpecialTypes';
import { PLAN_SLOTS, normalizeRoundPlan } from './roundPlan';
import { EXAMPLE_GROUP_NAME, buildExamplePlayers } from './exampleGroup';

export const KEYS = {
  rosters: 'pb-rosters',
  activeRoster: 'pb-active-roster',
  players: 'pb-roster',
  scheduleRoster: 'pb-schedule-roster',
  schedule: 'pb-schedule',
  completedRounds: 'pb-completed-rounds',
  legacyCompletedThrough: 'pb-completed-through',
  partnerships: 'pb-partnerships',
  numRounds: 'pb-num-rounds',
  roundPlan: 'pb-round-plan',
  specialTypes: 'pb-special-types',
  groupSessions: 'pb-group-sessions',
  legacyGenderedEnabled: 'pb-gendered-enabled',
  legacyGenderedFrequency: 'pb-gendered-frequency',
  exampleMeta: 'pb-example-meta',
} as const;

// The name minted when the app needs a group and has no example to give: a
// legacy pool being re-homed, or an empty account being adopted. Fresh installs
// get the example group instead — see the seeding branch below.
export const EMPTY_GROUP_NAME = 'My Group';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — nothing useful to do here
  }
}

/**
 * Brings stored data up to the multi-roster shape. Runs before React mounts so
 * the hooks below never observe a pre-migration state. Safe to run repeatedly:
 * once the data is in the new shape this is a no-op.
 */
export function runMigrations() {
  let rosters = read<Roster[]>(KEYS.rosters, []);

  if (rosters.length === 0) {
    const pool = read<Player[]>(KEYS.players, []);
    if (pool.length === 0) {
      // A true fresh install: no groups and nobody in the pool. Open on the
      // example group, fully populated, so there is something to try before
      // there is anything to type. What was seeded is recorded so sync can
      // tell an untouched example install from data somebody made.
      const rosterId = generateId();
      rosters = [{ id: rosterId, name: EXAMPLE_GROUP_NAME }];
      const seeded = buildExamplePlayers(rosterId, generateId);
      write(KEYS.rosters, rosters);
      write(KEYS.players, seeded);
      write(KEYS.exampleMeta, { rosterId, playerIds: seeded.map((p) => p.id) });
    } else {
      // A pool from before groups existed, with no roster list yet. Those
      // players get a plain group of their own — never the example crowd,
      // which would bury a real roster under twenty-four strangers.
      rosters = [{ id: generateId(), name: EMPTY_GROUP_NAME }];
      write(KEYS.rosters, rosters);
    }
  }

  const rosterIds = new Set(rosters.map((r) => r.id));

  // Active roster must always point at a roster that exists
  let activeId = read<string | null>(KEYS.activeRoster, null);
  if (!activeId || !rosterIds.has(activeId)) {
    activeId = rosters[0].id;
    write(KEYS.activeRoster, activeId);
  }

  // Players predate rosters entirely, and hand-edited storage may reference
  // rosters that have since been deleted. Both end up in the active roster
  // rather than becoming unreachable.
  const players = read<Player[]>(KEYS.players, []);
  let playersChanged = false;
  const migrated = players.map((p) => {
    const existing = Array.isArray(p.rosterIds) ? p.rosterIds.filter((id) => rosterIds.has(id)) : [];
    const next = existing.length > 0 ? existing : [activeId!];
    const unchanged =
      Array.isArray(p.rosterIds) &&
      p.rosterIds.length === next.length &&
      p.rosterIds.every((id, i) => id === next[i]);
    if (unchanged) return p;
    playersChanged = true;
    return { ...p, rosterIds: next };
  });
  if (playersChanged) write(KEYS.players, migrated);

  // Round completion used to be a prefix count (rounds 1..N complete). It is now
  // an arbitrary set of round numbers. Convert a mid-session count so an
  // in-progress session survives the upgrade.
  if (window.localStorage.getItem(KEYS.completedRounds) === null) {
    const through = read<number>(KEYS.legacyCompletedThrough, 0);
    write(
      KEYS.completedRounds,
      through > 0 ? Array.from({ length: through }, (_, i) => i + 1) : []
    );
  }

  // Fixed partnerships are new in this version; seed an empty list so the hook
  // reads a valid value on first run.
  if (window.localStorage.getItem(KEYS.partnerships) === null) {
    write(KEYS.partnerships, []);
  }

  // Gendered games used to be the only special format, with a flag and a
  // frequency of its own. Carry that setting into the three-type config so
  // anyone part-way through setting up a session keeps what they chose.
  if (window.localStorage.getItem(KEYS.specialTypes) === null) {
    const enabled = read<boolean>(KEYS.legacyGenderedEnabled, false);
    const frequency = read<number>(KEYS.legacyGenderedFrequency, 2);
    write(
      KEYS.specialTypes,
      normalizeSpecialTypes({
        ...DEFAULT_SPECIAL_TYPES,
        gendered: { ...DEFAULT_SPECIAL_TYPES.gendered, enabled, frequency },
      })
    );
  } else {
    // Configs stored by the first release have no order on them, and its
    // minimum frequency could be 2 or 3 where 1 is now allowed. Normalising
    // once here means the repair does not wait for the host's next edit.
    const stored = read<SpecialGameTypes>(KEYS.specialTypes, DEFAULT_SPECIAL_TYPES);
    write(KEYS.specialTypes, normalizeSpecialTypes({ ...DEFAULT_SPECIAL_TYPES, ...stored }));
  }

  // The three frequencies above are now only an input. What the host sets is a
  // plan: one entry per round saying what that round is played as. Derive their
  // first one from the frequencies they had already chosen, so nobody's session
  // changes shape on upgrade — every round that was going to be gendered still
  // is, on the same round number.
  //
  // Planned for 16 slots whatever the session's length, because the plan is
  // never truncated and the stepper stops at 16. Planning further ahead than
  // the host asked for is safe: planRoundTypes only ever looks forwards, which
  // is what extendSchedule already relied on.
  if (window.localStorage.getItem(KEYS.roundPlan) === null) {
    write(
      KEYS.roundPlan,
      planFrom(
        read<SpecialGameTypes>(KEYS.specialTypes, DEFAULT_SPECIAL_TYPES),
        read<number>(KEYS.numRounds, 8)
      )
    );
  }

  migrateParkedGroups();
}

/** One host's frequency settings, as the plan they were describing. */
function planFrom(raw: Partial<SpecialGameTypes> | undefined, numRounds: number) {
  const cfg = normalizeSpecialTypes({ ...DEFAULT_SPECIAL_TYPES, ...(raw ?? {}) });
  return normalizeRoundPlan(planRoundTypes(cfg, Math.max(PLAN_SLOTS, numRounds)));
}

/**
 * The same pass over every group the host is not looking at.
 *
 * Each parked group carries its own courts, rounds and round types — see
 * groupSessions.ts — so a group restored without a plan of its own would
 * quietly become all-ordinary, however the host had set it up. Each one's plan
 * comes from its own settings and its own round count, not the live slot's.
 */
function migrateParkedGroups() {
  const parked = read<Record<string, Record<string, unknown>>>(KEYS.groupSessions, {});
  let changed = false;
  const next: Record<string, Record<string, unknown>> = {};
  for (const [id, session] of Object.entries(parked)) {
    if (!session || typeof session !== 'object' || Array.isArray(session)) continue;
    if (session.roundPlan !== undefined) {
      next[id] = session;
      continue;
    }
    changed = true;
    const rounds = typeof session.numRounds === 'number' ? session.numRounds : 8;
    next[id] = {
      ...session,
      roundPlan: planFrom(session.specialTypes as Partial<SpecialGameTypes> | undefined, rounds),
    };
  }
  if (changed) write(KEYS.groupSessions, next);
}
