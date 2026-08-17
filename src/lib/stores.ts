import type { Player, Roster, Schedule, Partnership, RoundPlan } from '../types';
import type { SpecialGameTypes } from './legacySpecialTypes';
import type { Step } from './steps';
import type { GroupSession } from './groupSessions';
import type { ExampleMeta } from './exampleGroup';
import type { RoundTimerState } from './roundTimerState';
import type { AlarmToneId } from './alarmSounds';
import { createStoredValue } from './store';
import { DEFAULT_COURTS } from './assign';
import { KEYS, EMPTY_GROUP_NAME } from './migrations';
import { DEFAULT_SPECIAL_TYPES } from './legacySpecialTypes';
import { emptyPlan } from './roundPlan';
// From roundTimerState rather than from roundTimer, which imports this file:
// a cycle here seeds the store with `undefined` whenever the graph happens to
// reach the timer first. See roundTimerState.ts.
import { DEFAULT_ROUND_TIMER_STATE } from './roundTimerState';

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

export const numCourts = createStoredValue('pb-num-courts', DEFAULT_COURTS);
export const numRounds = createStoredValue(KEYS.numRounds, 8);

/**
 * Whether courts carry a scoreboard.
 *
 * Off by default. An existing host's court cards should not change under them
 * without being asked.
 */
export const scoringEnabled = createStoredValue<boolean>('pb-scoring-enabled', false);

/**
 * What each round is played as: gendered, mixed, equal-skill, or an ordinary
 * round robin. One entry per round from round 1, set by the host in Setup.
 *
 * Sixteen slots whether the session is four rounds or sixteen. The list only
 * ever draws as many as the session has, and keeping the rest means a host who
 * shortens the afternoon and changes their mind gets their plan back rather
 * than a row of blanks. See lib/roundPlan.ts.
 */
export const roundPlan = createStoredValue<RoundPlan>(KEYS.roundPlan, emptyPlan);

/**
 * The retired frequency settings, kept only so a rollback lands somewhere.
 *
 * Nothing in the app writes this any more — the plan above replaced it, and
 * runMigrations() reads this one to derive a host's first plan. It survives
 * here because sync still sends the column for this release: dropping it from
 * the row would leave the account's copy at whatever it held, but a build
 * rolled back to the old panel would then read a stale config and quietly plan
 * a different afternoon. Delete this, the column and the key together, one
 * release after the planner has stuck.
 */
export const legacySpecialTypes = createStoredValue<SpecialGameTypes>(
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
 * Whether the people watching this session may change its scores.
 *
 * Off unless the host says otherwise, and off again for every new session: it
 * is a decision about one afternoon and one group of people, not a preference
 * that should follow somebody to next Tuesday. Beside shareKey because it is
 * the same kind of thing — what this phone is publishing, right now.
 */
export const scoreEditingAllowed = createStoredValue<boolean>(
  'pb-score-editing-allowed',
  false
);

/**
 * Whether the people watching this session get the standings table.
 *
 * On unless the host says otherwise, because the table is most of what people
 * ask for once a round is played, and a host who has never thought about it
 * should not find it missing. Turning it off takes the panel off the watchers'
 * page and every link to it with it; the schedule and the scores stay exactly
 * as they were.
 *
 * Unlike scoreEditingAllowed above, this survives the end of a session. It is
 * a preference about what this host shares, not a decision about one afternoon
 * and one code told to one group of people.
 */
export const standingsShared = createStoredValue<boolean>('pb-standings-shared', true);

/**
 * The four digits a watcher must type before they can change a score, or null
 * while editing is off.
 *
 * Kept in the clear, on the host's own phone, because the host has to be able
 * to read it back and say it out loud to a court full of people. What leaves
 * the device is never this — see the note in liveSession.ts.
 */
export const scoreEditCode = createStoredValue<string | null>('pb-score-edit-code', null);

/**
 * Round numbers marked complete. An arbitrary set — the host may complete
 * rounds out of order.
 */
export const completedRounds = createStoredValue<number[]>(KEYS.completedRounds, []);

/**
 * The one round timer running (or configured, or paused) anywhere in the app.
 * Persisted with an absolute `endsAt` rather than a decrementing counter, so a
 * reload lands on the correct remaining time instead of losing it — see
 * lib/roundTimer.ts, which owns every read and write of this key.
 */
export const roundTimer = createStoredValue<RoundTimerState>(
  'pb-round-timer',
  DEFAULT_ROUND_TIMER_STATE
);

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
 * Couples a substitute has taken over, for this afternoon and no longer.
 *
 * Kept apart from `partnerships` because the two answer different questions.
 * That one is who somebody's partner is, set up once and carried into next
 * week. This one is who is covering for whom right now: Dave steps into Jeff's
 * seat beside Ann, and plays with Ann for the rest of the day. Writing that into
 * the standing list would say Dave is Ann's partner from now on, which is not
 * what anybody agreed when Jeff turned his ankle.
 *
 * Read through withSubbedPairs(), which lays these over the standing ones.
 * Emptied by clearSession() whichever way the session ends, like guests.
 */
export const subPartnerships = createStoredValue<Partnership[]>('pb-sub-partnerships', []);

/**
 * True once the host has hand-modified the generated schedule — a swap, a
 * player removal, or a score written down. Persisted alongside the schedule so a
 * refresh mid-session doesn't make an edited schedule look untouched.
 */
export const scheduleEdited = createStoredValue<boolean>('pb-schedule-edited', false);

/** Which group the saved session was built from. */
export const scheduleRosterId = createStoredValue<string | null>(KEYS.scheduleRoster, null);

/**
 * What the saved schedule was built from, as one string — see scheduleBasis.ts
 * for what goes into it and why.
 *
 * This is what keeps the Schedule tab open. It is written while the host is
 * looking at the schedule, so every mid-session change made from that page is
 * folded in by being made there, and compared against the live session whenever
 * they are somewhere else. Null means no promise: either no schedule, or one
 * parked by a build that did not record this.
 */
export const scheduleBasis = createStoredValue<string | null>('pb-schedule-basis', null);

export const installDismissed = createStoredValue('pb-install-dismissed', false);

/**
 * Whether the host has waved away the offer of an account. Device rather than
 * person, like the install offer above it: the banner is what somebody sees
 * before they have an account, so there is nowhere else to keep it.
 */
export const signInDismissed = createStoredValue('pb-signin-dismissed', false);

/**
 * A sign in code that has been emailed and not typed in yet: the address it
 * went to, and when it went.
 *
 * Stored rather than kept in the panel, because fetching the code means leaving
 * the app and iOS discards a backgrounded tab whenever it likes. Coming back to
 * a page that reloaded itself, with the code on the clipboard and no box to put
 * it in, is where a new host gives up: the way back in starts at the email
 * field, so the only move they can see is to send a second code and be handed
 * the same dead end again. auth.ts owns this; see pendingSignIn there.
 *
 * Device, and never synced. It describes one phone halfway through something.
 */
export interface PendingSignIn {
  email: string;
  /** Epoch ms. The code expires and so does this. */
  sentAt: number;
  /**
   * Set when the host shut My Account themselves with the code still unused.
   * The box is still waiting for them next time they open the panel; what stops
   * is the app opening it for them. They have said once that they are done for
   * now, and a panel that lets itself in on every launch for an hour is the app
   * arguing with them.
   */
  dismissed?: boolean;
}

export const pendingSignIn = createStoredValue<PendingSignIn | null>(
  'pb-pending-signin',
  null
);

/**
 * What one watching phone has decided to do when the host's timer reaches zero.
 *
 * The host sets the alarm for a court, so every phone starts on their choices.
 * But the phone on the bench belongs to somebody sitting next to the person
 * running it, and nine phones sounding at once is nine times the alarm anybody
 * asked for. So any of the three can be overridden here, on this phone only,
 * and anything left unset goes on following the host live.
 *
 * `session` is what makes it "for the rest of the session" rather than forever:
 * a record belonging to another afternoon is ignored and overwritten, so
 * scanning a new code starts from the host again. Written by lib/watchAlerts.ts,
 * which is the only thing that reads it.
 *
 * Device, and the one store the watcher's page writes at all.
 */
export interface WatchAlerts {
  session: string;
  soundOn?: boolean;
  flashOn?: boolean;
  alarmTone?: AlarmToneId;
}

export const watchAlerts = createStoredValue<WatchAlerts | null>('pb-watch-alerts', null);

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
 * How many times the settings drawer has been opened on this device, and which
 * of the twelve dressed-up robins it last put at the top. See robins.ts, which
 * owns the rules these two feed; nothing else reads them.
 *
 * Device rather than person, like the dismissals above: this is a running joke
 * about one phone, and a new phone is welcome to start its own.
 */
export const settingsOpens = createStoredValue('pb-settings-opens', 0);

/** -1 on a device that has not shown one yet. */
export const lastRobin = createStoredValue('pb-settings-robin', -1);

/**
 * What the fresh-install seed created, or null on a device that was never
 * seeded (updated installs, live-share viewers). Written by runMigrations(),
 * read by sync to recognise a device holding nothing anybody made, and cleared
 * when an account copy replaces the example. Never synced: it describes this
 * device's seed, not the person's data.
 */
export const exampleMeta = createStoredValue<ExampleMeta | null>(KEYS.exampleMeta, null);

/**
 * How far the first-run tour has got. Beside exampleMeta because the two gate
 * each other: the opening sheet needs this to be 'none' *and* that to be
 * non-null.
 *
 * Three words, and the middle one covers the whole run. 'none' is a device
 * nobody has greeted yet; Continue on the sheet moves it to 'running'; and it
 * ends at 'done', from the last card, from Skip, and from nowhere else.
 *
 * An earlier cut of the tour had two acts with a dormant stretch between them,
 * and stored 'act1', 'await-schedule' and 'act2' to tell those apart. Those
 * values can still be on a device that ran it. `resumeTour` treats anything it
 * does not recognise as 'done', which is the safe way to be wrong: worst case
 * somebody who saw most of a tour is not shown it again.
 *
 * Which card is showing is deliberately not in here. A relaunch re-derives it
 * from the stage and the tab, so a tour interrupted on the Setup tab comes back
 * on the Setup tab rather than wherever it was counted to.
 *
 * Device rather than person, like the dismissals above it: a new phone is a new
 * first run. To see it again on a device that has already had it, open the app
 * with `?tour=1`, or run
 *   localStorage.removeItem('pb-tour-stage'); location.reload();
 * Neither invents an exampleMeta, so a device that was never seeded with a
 * Sample Group still will not show it — which is honest, because the sheet
 * promises a sample group.
 */
export type TourStage = 'none' | 'running' | 'done';
export const tourStage = createStoredValue<TourStage>('pb-tour-stage', 'none');
