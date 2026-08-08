import type { SupabaseClient } from '@supabase/supabase-js';
import type { Player, Roster } from '../types';
import { ACCOUNTS_ENABLED } from './appInfo';
import { authStore, initAuth } from './auth';
import {
  drop,
  enqueue,
  outbox,
  pendingCount,
  playerRow,
  rosterRow,
  diffRows,
  PREFERENCES_ID,
  type OutboxEntry,
  type Row,
  type SyncTable,
} from './outbox';
import { createStoredValue } from './store';
import * as stores from './stores';
import { getSupabase, hasAuthCallback, hasStoredSession, isSupabaseConfigured } from './supabase';

/**
 * Push-only sync: what is on this device goes up to the account, and nothing
 * comes back down.
 *
 * That asymmetry is the whole safety argument for this step. The server can
 * only accumulate, so the worst a bug here can do is write bad rows into tables
 * nothing yet reads. Local data cannot be harmed, because no code path writes
 * to a store. Pulling — where a wrong answer overwrites someone's work — is a
 * step of its own, and arrives on top of a push path that has been running.
 *
 * Two cases are handled, and the rest are refused rather than guessed at:
 *
 * - **This device has never synced and the account is empty.** Seed it. Every
 *   roster, player and preference goes up under the id it already has locally,
 *   so both sides refer to the same person by the same id from then on and
 *   every later push is an ordinary idempotent upsert.
 * - **This device has synced to this same account.** Push what changed.
 *
 * An account that already has rows needs a merge, and a device whose data
 * belongs to somebody else's account needs the same machinery. Both are the
 * next step; here they stop the engine and say so, because pushing one
 * person's groups into another person's account is the one thing that would be
 * unrecoverable.
 */

// --------------------------------------------------------------- the status --

export type SyncStatus =
  /** Not configured, flag off, or nobody signed in. The app before accounts. */
  | { state: 'off' }
  /** Signed in; working out what this device is. */
  | { state: 'starting' }
  | { state: 'saving' }
  /** Everything on this device is on the account. */
  | { state: 'saved' }
  /** Changes are held locally. `problem` is null when they are simply queued. */
  | { state: 'waiting'; pending: number; problem: string | null }
  /** Nothing is being pushed, and will not be until merging exists. */
  | { state: 'blocked'; reason: 'server-has-data' | 'other-account' };

let status: SyncStatus = { state: 'off' };
const listeners = new Set<() => void>();

function setStatus(next: SyncStatus) {
  status = next;
  for (const listener of listeners) listener();
}

/** Shaped for useSyncExternalStore, like authStore. */
export const syncStatusStore = {
  get: (): SyncStatus => status,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

function settle(problem: string | null = null) {
  const pending = pendingCount();
  if (pending === 0 && problem === null) setStatus({ state: 'saved' });
  else setStatus({ state: 'waiting', pending, problem });
}

// -------------------------------------------------------------- the account --

/**
 * Which account this device's cache belongs to, or null if it has never synced.
 *
 * This is what makes first login idempotent. Signing out and back in finds the
 * id already recorded and takes the ordinary path, rather than re-running the
 * one-time decision about what this device is.
 */
const account = createStoredValue<string | null>('pb-sync-account', null);

// ------------------------------------------------------------- the tracking --

let untrack: (() => void)[] = [];
let lastRosters: Roster[] = [];
let lastPlayers: Player[] = [];

function preferencesRow(at: string): Row {
  return {
    active_roster_id: stores.activeRosterId.get(),
    default_rating: stores.defaultRating.get(),
    num_courts: stores.numCourts.get(),
    num_rounds: stores.numRounds.get(),
    large_text: stores.largeText.get(),
    special_types: stores.specialTypes.get(),
    updated_at: at,
  };
}

function preferencesEntry(at: string): OutboxEntry {
  return { table: 'preferences', id: PREFERENCES_ID, row: preferencesRow(at) };
}

/**
 * Watches the synced stores and turns each change into outbox entries.
 *
 * Only the person's data is watched. The live session — the schedule, which
 * rounds are done, who has sat out — stays on the device it is being run on.
 * Two phones at one court both ticking round three complete is a conflict with
 * no sensible answer, and the session is over in two hours.
 */
function startTracking() {
  if (untrack.length > 0) return;

  lastRosters = stores.rosters.get();
  lastPlayers = stores.players.get();

  untrack.push(
    stores.rosters.subscribe(() => {
      const next = stores.rosters.get();
      const entries = diffRows('rosters', lastRosters, next, rosterRow, stamp());
      lastRosters = next;
      if (entries.length > 0) {
        enqueue(entries);
        scheduleFlush();
      }
    })
  );

  untrack.push(
    stores.players.subscribe(() => {
      const next = stores.players.get();
      const entries = diffRows('players', lastPlayers, next, playerRow, stamp());
      lastPlayers = next;
      if (entries.length > 0) {
        enqueue(entries);
        scheduleFlush();
      }
    })
  );

  // Preferences are one row, replaced whole. They are single scalars nobody
  // edits concurrently, so there is nothing to gain from splitting them up.
  const preferenceStores = [
    stores.activeRosterId,
    stores.defaultRating,
    stores.numCourts,
    stores.numRounds,
    stores.largeText,
    stores.specialTypes,
  ];
  for (const store of preferenceStores) {
    untrack.push(
      store.subscribe(() => {
        enqueue([preferencesEntry(stamp())]);
        scheduleFlush();
      })
    );
  }
}

function stopTracking() {
  for (const off of untrack) off();
  untrack = [];
}

/**
 * The client clock, which is what orders a conflict. An edit made offline on
 * Tuesday must not lose to one made on Wednesday just because it synced later.
 * The pull cursor uses the server clock instead, so a device with a wrong clock
 * can win a conflict it should have lost but can never make itself invisible.
 */
function stamp(): string {
  return new Date().toISOString();
}

// ----------------------------------------------------------------- the push --

const CONFLICT_TARGET: Record<SyncTable, string> = {
  rosters: 'user_id,id',
  players: 'user_id,id',
  // One row per person, so the owner column is the whole key.
  preferences: 'user_id',
};

/** Rosters first, so a push that only half succeeds leaves the groups standing. */
const PUSH_ORDER: SyncTable[] = ['rosters', 'players', 'preferences'];

const FLUSH_DELAY_MS = 1500;

let userId: string | null = null;
let pushing = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Waits a moment before pushing, so typing a player's name is one upsert rather
 * than one per keystroke. The outbox coalesces by row anyway; this saves the
 * requests.
 */
function scheduleFlush(delay = FLUSH_DELAY_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, delay);
}

async function flush(): Promise<void> {
  if (pushing || userId === null || account.get() !== userId) return;

  const entries = outbox.get();
  const keys = Object.keys(entries);
  if (keys.length === 0) {
    settle();
    return;
  }

  pushing = true;
  setStatus({ state: 'saving' });

  // Tracked outside the try so a table that got through is still cleared when a
  // later one fails. Re-sending rows the server already has would be harmless,
  // but leaving them queued would show a count that never goes down.
  const done: string[] = [];

  try {
    const supabase = await getSupabase();

    for (const table of PUSH_ORDER) {
      const batch = keys.filter((key) => entries[key].table === table);
      if (batch.length === 0) continue;

      // user_id is left off every row: the column defaults to auth.uid(), so
      // the server names the owner and the with-check policy verifies it. A
      // client that has no say in whose row it is writing cannot get it wrong.
      const { error } = await supabase
        .from(table)
        .upsert(
          batch.map((key) => entries[key].row),
          { onConflict: CONFLICT_TARGET[table] }
        );
      if (error) throw new Error(error.message);
      done.push(...batch);
    }

    drop(done);
    settle();

    // Anything enqueued while that was in flight is still sitting there.
    if (pendingCount() > 0) scheduleFlush(0);
  } catch (error) {
    drop(done);
    settle(describe(error));
  } finally {
    pushing = false;
  }
}

/** Short, and about what the user should expect rather than what broke. */
function describe(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('load failed') ||
    text.includes('offline')
  ) {
    return "You're offline. These will go up when you're back on.";
  }
  return "Couldn't reach your account just now. This will try again.";
}

// ------------------------------------------------------------ first sign-in --

/** Does the account already hold groups or players? Tombstones count. */
async function serverHasData(supabase: SupabaseClient): Promise<boolean> {
  const [groups, people] = await Promise.all([
    supabase.from('rosters').select('id').limit(1),
    supabase.from('players').select('id').limit(1),
  ]);
  if (groups.error) throw new Error(groups.error.message);
  if (people.error) throw new Error(people.error.message);
  return (groups.data?.length ?? 0) > 0 || (people.data?.length ?? 0) > 0;
}

/** Queues everything this device holds, under the ids it already holds them by. */
function seed() {
  const at = stamp();
  enqueue([
    ...stores.rosters.get().map((roster) => ({
      table: 'rosters' as const,
      id: roster.id,
      row: rosterRow(roster, at),
    })),
    ...stores.players.get().map((player) => ({
      table: 'players' as const,
      id: player.id,
      row: playerRow(player, at),
    })),
    preferencesEntry(at),
  ]);
}

async function onSignedIn(id: string) {
  if (userId === id) return;
  userId = id;

  const owner = account.get();

  if (owner === id) {
    startTracking();
    settle();
    void flush();
    return;
  }

  if (owner !== null) {
    // Someone else's data is on this device. Pushing it into this account would
    // be the one mistake with no way back, so nothing moves until the merge
    // machinery exists to do it deliberately.
    setStatus({ state: 'blocked', reason: 'other-account' });
    return;
  }

  setStatus({ state: 'starting' });
  try {
    const supabase = await getSupabase();
    if (await serverHasData(supabase)) {
      setStatus({ state: 'blocked', reason: 'server-has-data' });
      return;
    }

    // Recorded before the push, not after. The decision this device is making
    // is "my cache belongs to this account", and that is settled the moment the
    // account is known to be empty. If the push then fails, the outbox holds
    // the rows and retries; if the flag waited for success, a half-finished
    // seed would look like an account with data on the next launch and lock
    // this device out of its own rows.
    account.set(id);

    // Tracking starts before the seed is queued, so an edit made while the
    // first push is in flight lands in the outbox rather than falling in the
    // gap between the snapshot and the subscription.
    startTracking();
    seed();
    await flush();
  } catch (error) {
    settle(describe(error));
  }
}

function onSignedOut() {
  userId = null;
  stopTracking();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  // The outbox is kept. Those changes belong to the account, not to the
  // session, and signing back in should take them up rather than lose them.
  setStatus({ state: 'off' });
}

// ---------------------------------------------------------------- the start --

let started = false;

/**
 * Called once, from the app's first render. Cheap for everyone it does not
 * apply to: with no env vars, the flag off, or nobody signed in on this
 * browser, it returns having imported nothing and touched no network.
 */
export function startSync(): void {
  if (started) return;
  started = true;
  if (!ACCOUNTS_ENABLED || !isSupabaseConfigured()) return;

  const follow = () => {
    const auth = authStore.get();
    if (auth.status === 'signed-in') void onSignedIn(auth.userId);
    else if (auth.status === 'signed-out') onSignedOut();
  };

  authStore.subscribe(follow);
  follow();

  // Only wake the client for somebody who is actually signed in.
  if (hasStoredSession() || hasAuthCallback()) void initAuth();

  window.addEventListener('online', () => {
    if (userId !== null) scheduleFlush(0);
  });
}

/** Exported for the tests, which need to run more than one sign-in per process. */
export const __testing = {
  reset() {
    started = false;
    userId = null;
    pushing = false;
    stopTracking();
    if (timer) clearTimeout(timer);
    timer = null;
    status = { state: 'off' };
  },
  account,
  flush,
  seed,
  preferencesRow,
};
