import type { Player, Roster, Schedule, Partnership, SpecialGameTypes } from '../types';
import type { Step } from './steps';
import type { GroupSession } from './groupSessions';
import type { ExampleMeta } from './exampleGroup';
import { createStoredValue } from './store';
import { KEYS, EMPTY_GROUP_NAME } from './migrations';
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
  { id: 'default', name: EMPTY_GROUP_NAME },
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
export const largeText = createStoredValue<boolean>('pb-large-text', false);

// ------------------------------------------------------- The group in front
// How this club night is run. These four hold the active group's answers and
// nobody else's: groupSessions.ts parks them under the group being left and
// restores the group being opened, so Riverside's four courts and Tuesday's two
// stop overwriting each other. A group nobody has set up yet inherits whatever
// is here, which is the last thing the host used.

export const numCourts = createStoredValue('pb-num-courts', 3);
export const numRounds = createStoredValue('pb-num-rounds', 8);

/**
 * Whether courts carry a scoreboard.
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

/**
 * Which tab is open.
 *
 * Persisted, and part of what a group is parked with, so coming back to a group
 * lands where that group was left. It also means a relaunch reopens the tab the
 * host was on rather than always the first one.
 *
 * Read through currentStep() in groupSessions.ts, never raw: a stored 'schedule'
 * with no schedule under it is a tab that cannot draw.
 */
export const step = createStoredValue<Step>('pb-step', 'roster');

/**
 * Whether this group has ever been taken as far as Setup. Once it has, the tab
 * stays open, so a trip back to Players is never a dead end.
 */
export const setupSeen = createStoredValue<boolean>('pb-setup-seen', false);

/**
 * Every group's state but the one open, keyed by group id.
 *
 * The stores below are the live slot: they always describe the active group,
 * which is why sync and sharing can go on reading them without knowing any of
 * this exists. Switching groups empties the live slot into here and fills it
 * back up from the group being opened. See groupSessions.ts.
 */
export const groupSessions = createStoredValue<Record<string, GroupSession>>(
  'pb-group-sessions',
  {}
);

/** Persisted so a refresh mid-session doesn't lose the schedule. */
export const schedule = createStoredValue<Schedule | null>(KEYS.schedule, null);

/**
 * This session, by name. Minted when a schedule is generated and gone when the
 * session is.
 *
 * Read by sharing, which uses it to recognise an afternoon across a Stop and a
 * Share rather than publishing it a second time under a second link.
 */
export const sessionId = createStoredValue<string | null>('pb-session-id', null);

/**
 * The key this session is published under, or null while it is not.
 *
 * The device's rather than the person's, and it belongs beside the schedule for
 * the same reason the schedule does: it names one afternoon on one phone. A
 * second phone signed into the same account is not sharing this session, and
 * would overwrite the link if it thought it was.
 *
 * It is also what makes republishing an upsert. Without it every save would
 * mint a new key, and the QR code somebody photographed ten minutes ago would
 * stop answering.
 */
export const shareKey = createStoredValue<string | null>('pb-share-key', null);

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
 * Whether the host has waved away the offer of an account. Device rather than
 * person, like the install offer above it: the banner is what somebody sees
 * before they have an account, so there is nowhere else to keep it.
 */
export const signInDismissed = createStoredValue('pb-signin-dismissed', false);

/**
 * Whether the host has waved away the line telling them how to swap two
 * players. Once is enough: they know now, and it sat at the top of the schedule
 * on every session for the rest of time.
 *
 * Device rather than person, like the install offer above it. Nothing is lost
 * by a new phone showing the hint once.
 */
export const swapHintDismissed = createStoredValue('pb-swap-hint-dismissed', false);

/**
 * What the fresh-install seed created, or null on a device that was never
 * seeded (updated installs, live-share viewers). Written by runMigrations(),
 * read by sync to recognise a device holding nothing anybody made, and cleared
 * when an account copy replaces the example. Never synced: it describes this
 * device's seed, not the person's data.
 */
export const exampleMeta = createStoredValue<ExampleMeta | null>(KEYS.exampleMeta, null);

/**
 * The splash's "Don't show at startup" box. Device rather than person, like
 * the dismissals above it: a new phone showing the invitation once loses
 * nothing.
 */
export const tutorialDismissed = createStoredValue('pb-tutorial-dismissed', false);

/** True once the tutorial has been finished. Ends the splash's return visits. */
export const tutorialCompleted = createStoredValue('pb-tutorial-completed', false);

/**
 * When the splash last showed, epoch milliseconds. The first persisted
 * timestamp in the app: the splash returns on the Players tab at most once an
 * hour until it is completed or waved away, and an hour has to be measured
 * from somewhere that survives a relaunch.
 */
export const tutorialSplashAt = createStoredValue<number>('pb-tutorial-splash-at', 0);

/**
 * A tutorial run's cleanup record. A rerun plays in a temporary group that
 * must not outlive it, so the run is written down before the switch and erased
 * after the cleanup — whichever of finish, stop or next-launch sweep gets
 * there first. Null whenever no tutorial is underway.
 */
export interface TutorialPersist {
  mode: 'first-run' | 'rerun';
  rerun?: { tempRosterId: string; tempPlayerIds: string[]; prevRosterId: string };
}

export const tutorialState = createStoredValue<TutorialPersist | null>('pb-tutorial-state', null);
