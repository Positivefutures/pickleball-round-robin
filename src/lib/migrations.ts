import type { Player, Roster } from '../types';
import { generateId } from '../utils/helpers';

export const KEYS = {
  rosters: 'pb-rosters',
  activeRoster: 'pb-active-roster',
  players: 'pb-roster',
  coreImportedRosters: 'pb-core-imported-rosters',
  legacyCoreImported: 'pb-core-imported',
  scheduleRoster: 'pb-schedule-roster',
  schedule: 'pb-schedule',
  completedRounds: 'pb-completed-rounds',
  legacyCompletedThrough: 'pb-completed-through',
  partnerships: 'pb-partnerships',
} as const;

export const DEFAULT_ROSTER_NAME = 'Main Group';

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
  const freshInstall = rosters.length === 0;

  if (freshInstall) {
    rosters = [{ id: generateId(), name: DEFAULT_ROSTER_NAME }];
    write(KEYS.rosters, rosters);
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

  // The old core-import flag was a single global boolean; it now tracks which
  // rosters have been seeded, so a new roster can still import.
  if (window.localStorage.getItem(KEYS.coreImportedRosters) === null) {
    const legacy = read<boolean>(KEYS.legacyCoreImported, false);
    write(KEYS.coreImportedRosters, legacy ? [activeId] : []);
  }

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
}
