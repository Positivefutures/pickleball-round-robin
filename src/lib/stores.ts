import type { Player, Roster, Schedule, Partnership, SpecialGameTypes } from '../types';
import { createStoredValue } from './store';
import { KEYS, DEFAULT_ROSTER_NAME } from './migrations';
import { DEFAULT_SPECIAL_TYPES } from './roundTypes';

/**
 * Every persisted value in the app, in one place.
 *
 * They are module-level on purpose. A store is the sole owner of its key, and
 * two stores over one key would each hold their own copy and drift apart. None
 * of them reads storage until first use, so runMigrations() still gets to
 * reshape everything first — see main.tsx.
 *
 * The split below is the one that matters for accounts: what belongs to the
 * person, and what belongs to the device they happen to be holding.
 */

// ---------------------------------------------------------------- The person
// Groups, players and preferences. This is what a host would lose by changing
// phone, and what an account exists to keep.

/** runMigrations() guarantees at least one roster and a valid active id. */
export const rosters = createStoredValue<Roster[]>(KEYS.rosters, [
  { id: 'default', name: DEFAULT_ROSTER_NAME },
]);

export const activeRosterId = createStoredValue<string>(
  KEYS.activeRoster,
  () => rosters.get()[0]?.id ?? 'default'
);

/**
 * One global pool of players. Roster membership lives on each player as
 * `rosterIds`, because a player may belong to any number of groups — so the
 * active group's list is a filter over the pool rather than a store of its own.
 */
export const players = createStoredValue<Player[]>(KEYS.players, []);

export const defaultRating = createStoredValue('pb-default-rating', 4.0);
export const numCourts = createStoredValue('pb-num-courts', 3);
export const numRounds = createStoredValue('pb-num-rounds', 8);
export const largeText = createStoredValue<boolean>('pb-large-text', false);

/**
 * Whether courts carry a scoreboard.
 *
 * The person's rather than the device's: keeping score is how this host runs
 * their group, the same sort of thing as the number of courts they book. The
 * device half below exists for what two phones could disagree about mid-session,
 * and a preference is not that — a second phone at the same session showing no
 * scoreboards would read as a fault.
 *
 * Off by default. An existing host's court cards should not change under them
 * without being asked.
 */
export const scoringEnabled = createStoredValue<boolean>('pb-scoring-enabled', false);

/** Gendered, mixed and equal-skill rounds, each with its own frequency. */
export const specialTypes = createStoredValue<SpecialGameTypes>(
  KEYS.specialTypes,
  DEFAULT_SPECIAL_TYPES
);

// ---------------------------------------------------------------- The device
// The session being run right now, and what this browser has been told. Two
// phones at one court both ticking a round complete is a conflict with no
// sensible answer, and a session lasts an afternoon — so this half stays where
// it is rather than following the person around.

/** Persisted so a refresh mid-session doesn't lose the schedule. */
export const schedule = createStoredValue<Schedule | null>(KEYS.schedule, null);

/**
 * This session, by name. Minted when a schedule is generated and gone when the
 * session is.
 *
 * Nothing reads it yet. It exists so that sharing a session already an hour
 * under way has a key to hand, rather than having to invent one for an
 * afternoon that is half over.
 */
export const sessionId = createStoredValue<string | null>('pb-session-id', null);

/**
 * Round numbers marked complete. An arbitrary set — the host may complete
 * rounds out of order.
 */
export const completedRounds = createStoredValue<number[]>(KEYS.completedRounds, []);

export const selectedIds = createStoredValue<string[]>('pb-selected-ids', []);
export const removedIds = createStoredValue<string[]>('pb-removed-ids', []);

/**
 * People playing this session who are not in the group: a friend brought along,
 * somebody's visiting brother. They are kept here rather than in the pool above
 * for two reasons, and both of them bite.
 *
 * Sync watches the pool and would push a guest up as a permanent player, where
 * the merge matches on name and lets the account win — so a guest called Dave
 * would quietly become the group's Dave. And runMigrations() re-homes any player
 * with no groups into the active one, so "a player belonging to nothing" does
 * not survive a refresh.
 *
 * Nothing looks at this key but the session, and clearSession() empties it.
 */
export const guests = createStoredValue<Player[]>('pb-guests', []);

/**
 * Fixed partnerships: couples kept on the same team every round. Persisted so
 * they survive a refresh and carry into the next session with the same crowd.
 */
export const partnerships = createStoredValue<Partnership[]>(KEYS.partnerships, []);

/**
 * True once the host has hand-modified the generated schedule — a swap, a
 * player removal, or a score written down. Persisted alongside the schedule so a
 * refresh mid-session doesn't make an edited schedule look untouched.
 */
export const scheduleEdited = createStoredValue<boolean>('pb-schedule-edited', false);

/** Which group the saved session was built from. */
export const scheduleRosterId = createStoredValue<string | null>(KEYS.scheduleRoster, null);

export const installDismissed = createStoredValue('pb-install-dismissed', false);

/**
 * Whether the host has waved away the line telling them how to swap two
 * players. Once is enough: they know now, and it sat at the top of the schedule
 * on every session for the rest of time.
 *
 * Device rather than person, like the install offer above it. Nothing is lost
 * by a new phone showing the hint once.
 */
export const swapHintDismissed = createStoredValue('pb-swap-hint-dismissed', false);
