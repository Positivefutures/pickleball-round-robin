import type { SupabaseClient } from '@supabase/supabase-js';
import type { Player, Roster, SpecialGameTypes } from '../types';
import { ACCOUNTS_ENABLED } from './appInfo';
import { authStore, initAuth } from './auth';
import { EMPTY_GROUP_NAME } from './migrations';
import { EXAMPLE_GROUP_NAME } from './exampleGroup';
import {
  drop,
  enqueue,
  outbox,
  pendingCount,
  playerRow,
  rosterRow,
  diffRows,
  entryKey,
  PREFERENCES_ID,
  type OutboxEntry,
  type Row,
  type SyncTable
} from './outbox';
import { createStoredValue, type StoredValue } from './store';
import * as stores from './stores';
import { planMerge, remapSession, remapParked, type Snapshot } from './syncMerge';
import {
  switchToGroup, resume as resumeGroup, forget as forgetGroupSession,
} from './groupSessions';
import { getSupabase, hasAuthCallback, hasStoredSession, isSupabaseConfigured } from './supabase';

/**
 * Two-device sync: what is on this device goes up, and what is on the account
 * comes down.
 *
 * Pushing was the safe half and shipped on its own, because the worst a bug
 * could do was write rows nobody read. Pulling is the half where a wrong answer
 * overwrites someone's work, so it is built on three rules rather than one
 * clever mechanism:
 *
 * 1. **Only touched rows are pushed.** The outbox holds what the user actually
 *    changed. A device that has been in a bag for a month uploads the two
 *    players it edited, not its whole stale cache over the top of newer work.
 * 2. **A pending local edit beats an incoming row.** If the outbox holds a row,
 *    the pull skips it. The user's unsent change is not discarded to make room
 *    for the copy it was about to replace.
 * 3. **Deletes are tombstones.** A physical delete would be undone the moment
 *    the other device pushed its copy back up, having no way to know the row
 *    was meant to be gone.
 *
 * When neither side can be assumed — an account that already has groups, or a
 * device whose cache belongs to somebody else — nothing moves and the panel
 * asks. Guessing is what would lose data here, and the question is one sentence
 * long.
 */

// --------------------------------------------------------------- the status --

/** How much is on each side, so the question can be asked in numbers. */
export interface Counts {
  rosters: number;
  players: number;
}

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
  /**
   * Could not find out what this device is, so sync has not started. Distinct
   * from `waiting` on purpose: nothing is queued, because nothing is being
   * tracked yet. Reporting a count here would say "0 changes still to save",
   * which is true and useless — the changes are not saved, they are simply not
   * counted, and the number invites exactly the wrong conclusion.
   */
  | { state: 'unready'; problem: string; detail: string | null }
  /** Waiting on the one decision this code will not make for anybody. */
  | {
      state: 'choice';
      reason: 'server-has-data' | 'other-account';
      account: Counts;
      device: Counts;
      /** Names held on both sides, which combining would fold into one. */
      matched: string[];
    };

/** The outcome of a merge, shaped like the import summaries already on screen. */
export interface SyncReport {
  title: string;
  details: string[];
}

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
  }
};

function settle(problem: string | null = null) {
  const pending = pendingCount();
  // Nothing queued means everything that mattered got through, whatever
  // happened on the way. Warning about an empty queue is noise.
  if (pending === 0) setStatus({ state: 'saved' });
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

/**
 * What this device believes the account already holds.
 *
 * Without it, a change made while signed out would be invisible twice over:
 * never pushed, because nothing was watching, and then quietly overwritten by
 * the first pull. Tracking starts by diffing the live stores against this, so
 * those edits are caught up rather than lost.
 */
const mirror = createStoredValue<Snapshot | null>('pb-sync-mirror', null);

/**
 * How far this device has read the account, on the *server's* clock.
 *
 * Deliberately not the client clock that orders conflicts. A device an hour
 * fast can win a conflict it should have lost, which costs one edit, but it can
 * never stamp a row into the past and make itself invisible to the other
 * device, which would cost everything after it.
 *
 * Kept per account, so signing into a second account on one browser starts from
 * the beginning rather than inheriting someone else's place.
 */
const cursors = new Map<string, StoredValue<string | null>>();

function cursorFor(id: string): StoredValue<string | null> {
  let store = cursors.get(id);
  if (!store) {
    store = createStoredValue<string | null>(`pb-sync-cursor:${id}`, null);
    cursors.set(id, store);
  }
  return store;
}

// ------------------------------------------------------------- the tracking --

let untrack: (() => void)[] = [];
let lastRosters: Roster[] = [];
let lastPlayers: Player[] = [];
/** True while a pull is writing to the stores, so it is not read back as an edit. */
let applying = false;

function preferencesRow(at: string): Row {
  return {
    active_roster_id: stores.activeRosterId.get(),
    default_rating: stores.defaultRating.get(),
    num_courts: stores.numCourts.get(),
    num_rounds: stores.numRounds.get(),
    large_text: stores.largeText.get(),
    special_types: stores.specialTypes.get(),
    // Held back from the scoring release on purpose: preferences has fixed
    // columns, so this needed an alter table run before any client could send
    // it. That SQL is supabase/migrations/0005_live_sessions.sql. Sending this
    // to a database without the column gets PGRST204, and PostgREST rejects the
    // whole row, so every preference stops syncing for everyone signed in.
    scoring_enabled: stores.scoringEnabled.get(),
    // Added by supabase/migrations/0006_swap_hint.sql, and subject to exactly
    // the PGRST204 hazard described above it.
    swap_hint_dismissed: stores.swapHintDismissed.get(),
    updated_at: at
  };
}

function preferencesEntry(at: string): OutboxEntry {
  return { table: 'preferences', id: PREFERENCES_ID, row: preferencesRow(at) };
}

function snapshotNow(): Snapshot {
  return { rosters: stores.rosters.get(), players: stores.players.get() };
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

  const base = mirror.get();
  const now = snapshotNow();

  // Anything edited while signed out happened with nothing watching, so it is
  // not in the outbox and the subscriptions below will never see it. Catch it
  // up first, or the next pull would overwrite work that had never been sent.
  if (base) {
    const at = stamp();
    const caught = [
      ...diffRows('rosters', base.rosters, now.rosters, rosterRow, at),
      ...diffRows('players', base.players, now.players, playerRow, at)
    ];
    if (caught.length > 0) enqueue(caught);
  }

  lastRosters = now.rosters;
  lastPlayers = now.players;

  untrack.push(
    stores.rosters.subscribe(() => {
      if (applying) return;
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
      if (applying) return;
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
    // Both of these were being sent in the row but not watched, so changing one
    // on its own pushed nothing: it sat on the device until some other
    // preference happened to change and carried it along. For scoring that is
    // a slow surprise; for the swap hint it would have defeated the point of
    // the column, since closing the banner is the only thing that ever sets it.
    stores.scoringEnabled,
    stores.swapHintDismissed
  ];
  for (const store of preferenceStores) {
    untrack.push(
      store.subscribe(() => {
        if (applying) return;
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
 * Records the stores as the account's copy, but only once nothing is queued.
 * A mirror written while rows were still waiting would mark them as sent.
 */
function saveMirror() {
  if (pendingCount() > 0) return;
  mirror.set(snapshotNow());
}

/**
 * The client clock, which is what orders a conflict. An edit made offline on
 * Tuesday must not lose to one made on Wednesday just because it synced later.
 */
function stamp(): string {
  return new Date().toISOString();
}

// ----------------------------------------------------------------- the push --

const CONFLICT_TARGET: Record<SyncTable, string> = {
  rosters: 'user_id,id',
  players: 'user_id,id',
  // One row per person, so the owner column is the whole key.
  preferences: 'user_id'
};

/** Rosters first, so a push that only half succeeds leaves the groups standing. */
const PUSH_ORDER: SyncTable[] = ['rosters', 'players', 'preferences'];

const FLUSH_DELAY_MS = 1500;

let userId: string | null = null;
let pushing = false;
let pulling = false;
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

/**
 * How long to wait before pushing again after a failure, doubling to a ceiling.
 * Sync is never urgent, because the change is safe on the device either way, so
 * the failure mode to avoid is a phone with no signal retrying in a tight loop
 * until its battery is flat.
 */
const PUSH_RETRY_BASE_MS = 15_000;
const PUSH_RETRY_CAP_MS = 5 * 60_000;

let pushAttempt = 0;

/**
 * Brings a failed push back on its own.
 *
 * Nothing else will. The `online` event fires when the interface drops
 * entirely, and a phone on one bar at a court never does that — it holds a
 * connection that fails every request, which looks identical to a working one
 * until you try. `visibilitychange` needs the tab to have been away. So without
 * this, a push that failed sat queued until the person happened to edit
 * something else, while the panel told them it was trying again.
 *
 * Only the delay backs off. An ordinary edit still schedules its flush 1.5
 * seconds later however many failures came before it: somebody typing is
 * present and watching, and is worth one request. The backoff is for the phone
 * left in a pocket, which is where the battery goes.
 */
function schedulePushRetry() {
  const wait = Math.min(PUSH_RETRY_BASE_MS * 2 ** pushAttempt, PUSH_RETRY_CAP_MS);
  pushAttempt += 1;
  scheduleFlush(wait);
}

async function flush(): Promise<void> {
  if (pushing || userId === null || account.get() !== userId) return;

  const entries = outbox.get();
  const keys = Object.keys(entries);
  if (keys.length === 0) {
    settle();
    saveMirror();
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
      const { error } = await supabase.from(table).upsert(
        batch.map((key) => entries[key].row),
        { onConflict: CONFLICT_TARGET[table] }
      );
      if (error) throw new Error(error.message);
      done.push(...batch);
    }

    drop(done);
    settle();
    saveMirror();
    // The connection works. Whatever the last dead spot cost, the next failure
    // starts counting from the short delay again rather than from five minutes.
    pushAttempt = 0;

    // Anything enqueued while that was in flight is still sitting there.
    if (pendingCount() > 0) scheduleFlush(0);
    // Rows this device just wrote have moved the account on. Reading straight
    // back is what makes two browsers open side by side keep up with each
    // other without a subscription. It cannot loop: applying a pull is not
    // seen as an edit, so nothing new is queued.
    else void pullNow();
  } catch (error) {
    drop(done);
    settle(describe(error));
    // A full account refuses the same batch identically every time, so a retry
    // would spend the battery to be told no again. describe() already declines
    // to promise one for that case; this is the half that makes it true.
    if (!isAccountFull(error)) schedulePushRetry();
  } finally {
    pushing = false;
  }
}

/** Short, and about what the user should expect rather than what broke. */
function describe(error: unknown): string {
  if (looksOffline(error)) return "You're offline. These will go up when you're back on.";
  // The per-account limits in supabase/migrations/0003_row_caps.sql. Nothing
  // else in this file can produce an error that retrying will never fix, and
  // "trying again" would be a lie: the same batch is refused every time. The
  // limits are set far above real use, so reaching this means either an account
  // being used as storage or a limit set too low, and both need saying out loud
  // rather than looking like a bad connection.
  if (isAccountFull(error)) return raw(error);
  return "Couldn't reach your account just now. Trying again.";
}

function isAccountFull(error: unknown): boolean {
  return raw(error).startsWith('This account is full.');
}

function looksOffline(error: unknown): boolean {
  const text = raw(error).toLowerCase();
  return (
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('load failed') ||
    text.includes('offline')
  );
}

function raw(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

// ----------------------------------------------------------------- the pull --

interface Pulled {
  rosters: Row[];
  players: Row[];
  preferences: Row | null;
  /** The newest server_updated_at seen, or null when nothing came back. */
  cursor: string | null;
}

async function fetchSince(supabase: SupabaseClient, since: string | null): Promise<Pulled> {
  const read = (table: SyncTable) => {
    const query = supabase.from(table).select('*');
    // Greater-than-or-equal, not greater-than. A row written in the same tick
    // as the newest one this device saw would otherwise be stepped over and
    // never read again. Re-reading one row costs nothing, and applying a row
    // already held is a no-op.
    return since ? query.gte('server_updated_at', since) : query;
  };

  const [rosters, players, preferences] = await Promise.all([
    read('rosters'),
    read('players'),
    read('preferences')
  ]);

  for (const result of [rosters, players, preferences]) {
    if (result.error) throw new Error(result.error.message);
  }

  const rosterRows = (rosters.data ?? []) as Row[];
  const playerRows = (players.data ?? []) as Row[];
  const preferenceRows = (preferences.data ?? []) as Row[];

  let cursor: string | null = null;
  for (const row of [...rosterRows, ...playerRows, ...preferenceRows]) {
    const at = row.server_updated_at;
    if (typeof at === 'string' && (cursor === null || at > cursor)) cursor = at;
  }

  return {
    rosters: rosterRows,
    players: playerRows,
    preferences: preferenceRows[0] ?? null,
    cursor
  };
}

function toRoster(row: Row): Roster {
  return { id: String(row.id), name: String(row.name) };
}

function toPlayer(row: Row): Player {
  return {
    id: String(row.id),
    name: String(row.name),
    // Number(), not a cast. The column is `real` precisely so PostgREST hands
    // back a JS number, but a schema drift to `numeric` would return the string
    // "3.75" and quietly break every rating comparison in the pairing code.
    rating: Number(row.rating),
    gender: row.gender === 'F' ? 'F' : 'M',
    rosterIds: Array.isArray(row.roster_ids) ? (row.roster_ids as string[]) : []
  };
}

function isGone(row: Row): boolean {
  return row.deleted_at !== null && row.deleted_at !== undefined;
}

/**
 * Folds incoming rows into a local list.
 *
 * A row the outbox is still holding is left alone. That is the rule that stops
 * a pull from discarding an edit the user made a moment ago and has not managed
 * to send yet — the local copy is newer by definition, and it is on its way up.
 */
function foldIn<T extends { id: string }>(
  table: SyncTable,
  current: T[],
  rows: Row[],
  toLocal: (row: Row) => T
): T[] {
  const queued = outbox.get();
  const next = [...current];
  const at = new Map(next.map((item, index) => [item.id, index]));

  for (const row of rows) {
    const id = String(row.id);
    if (queued[entryKey(table, id)]) continue;

    const index = at.get(id);
    if (isGone(row)) {
      if (index !== undefined) {
        next.splice(index, 1);
        at.clear();
        next.forEach((item, i) => at.set(item.id, i));
      }
      continue;
    }

    if (index === undefined) {
      at.set(id, next.length);
      next.push(toLocal(row));
    } else {
      next[index] = toLocal(row);
    }
  }

  return next;
}

function applyPulled(pulled: Pulled) {
  if (pulled.rosters.length === 0 && pulled.players.length === 0 && pulled.preferences === null) {
    return;
  }

  applying = true;
  try {
    if (pulled.rosters.length > 0) {
      const next = foldIn('rosters', stores.rosters.get(), pulled.rosters, toRoster);
      // The app assumes at least one group exists, and every screen is built
      // around the active one. An account that somehow tombstoned them all is
      // not a reason to hand back a broken app.
      if (next.length > 0) stores.rosters.set(next);
    }

    if (pulled.players.length > 0) {
      stores.players.set(foldIn('players', stores.players.get(), pulled.players, toPlayer));
    }

    if (pulled.preferences && !outbox.get()[entryKey('preferences', PREFERENCES_ID)]) {
      applyPreferences(pulled.preferences);
    }

    // A group deleted on the other device may have been the one open here. Its
    // parked session goes too, and the group taking its place is opened rather
    // than merely pointed at, so the live slot stops describing a group that is
    // no longer in the list.
    const rosters = stores.rosters.get();
    const open = stores.activeRosterId.get();
    if (!rosters.some((r) => r.id === open)) {
      forgetGroupSession(open);
      const next = rosters[0]?.id ?? '';
      stores.activeRosterId.set(next);
      if (next) resumeGroup(next);
    }
  } finally {
    applying = false;
    lastRosters = stores.rosters.get();
    lastPlayers = stores.players.get();
  }

  saveMirror();
}

/**
 * @param starting True on the two paths that hand this device a whole account:
 * combine and adopt. Only those may write the four settings that now belong to
 * a group rather than to the person.
 *
 * On an ordinary pull they are skipped. The row carries whichever group happened
 * to be open on the device that sent it, so applying it here would let a phone
 * sitting on Riverside's four courts reset the two courts Tuesday Crew is
 * playing on. On a device that is only just arriving there is no group with an
 * opinion yet, and they are the right thing to open every group with.
 */
function applyPreferences(row: Row, starting = false) {
  const {
    active_roster_id,
    default_rating,
    num_courts,
    num_rounds,
    large_text,
    special_types,
    scoring_enabled,
    swap_hint_dismissed
  } = row;

  // Only if this device knows the group. Pointing at one it has not pulled yet
  // would empty every screen until it arrived.
  if (
    typeof active_roster_id === 'string' &&
    stores.rosters.get().some((r) => r.id === active_roster_id)
  ) {
    // Through the one door, so the group being left is parked and the group
    // being opened is filled in. Setting the id alone would leave this device
    // showing one group's name over another group's session.
    switchToGroup(active_roster_id);
  }
  if (typeof default_rating === 'number') stores.defaultRating.set(default_rating);
  if (typeof large_text === 'boolean') stores.largeText.set(large_text);
  // One way only, unlike every line above it. The rest of this row is
  // last-write-wins, which is right for a setting somebody can change their
  // mind about; it is wrong for a hint that has been read. A device that
  // changed the court count while its own copy still said false would
  // otherwise carry that false to a phone where the banner had been closed,
  // and reopen it — which is the complaint this column exists to end.
  if (swap_hint_dismissed === true) stores.swapHintDismissed.set(true);

  if (!starting) return;
  if (typeof num_courts === 'number') stores.numCourts.set(num_courts);
  if (typeof num_rounds === 'number') stores.numRounds.set(num_rounds);
  if (typeof scoring_enabled === 'boolean') stores.scoringEnabled.set(scoring_enabled);
  if (special_types && typeof special_types === 'object') {
    stores.specialTypes.set(special_types as SpecialGameTypes);
  }
}

async function pullNow(): Promise<void> {
  const id = userId;
  if (pulling || id === null || account.get() !== id) return;

  pulling = true;
  try {
    const supabase = await getSupabase();
    const cursor = cursorFor(id);
    const pulled = await fetchSince(supabase, cursor.get());
    applyPulled(pulled);
    if (pulled.cursor) cursor.set(pulled.cursor);
  } catch (error) {
    settle(describe(error));
  } finally {
    pulling = false;
  }
}

/** Read, then write. Reading first means an incoming delete is not fought over. */
async function syncNow(): Promise<void> {
  await pullNow();
  await flush();
}

// ------------------------------------------------------------ first sign-in --

/** Everything on the account, live rows only, as the local types spell them. */
function liveSnapshot(pulled: Pulled): Snapshot {
  return {
    rosters: pulled.rosters.filter((row) => !isGone(row)).map(toRoster),
    players: pulled.players.filter((row) => !isGone(row)).map(toPlayer)
  };
}

/** Queues everything this device holds, under the ids it already holds them by. */
function seed() {
  const at = stamp();
  enqueue([
    ...stores.rosters.get().map((roster) => ({
      table: 'rosters' as const,
      id: roster.id,
      row: rosterRow(roster, at)
    })),
    ...stores.players.get().map((player) => ({
      table: 'players' as const,
      id: player.id,
      row: playerRow(player, at)
    })),
    preferencesEntry(at)
  ]);
}

/** The account as it was when the question was asked, held until it is answered. */
let choice: {
  id: string;
  reason: 'server-has-data' | 'other-account';
  server: Snapshot;
  preferences: Row | null;
  cursor: string | null;
} | null = null;

/** Dropped as soon as the question is answered, or stops being asked. */
let unwatchChoice: (() => void)[] = [];

function counts(snapshot: Snapshot): Counts {
  return { rosters: snapshot.rosters.length, players: snapshot.players.length };
}

/**
 * Whether this device holds nothing anybody made.
 *
 * A fresh install opens on the example group and its sample players, so
 * "empty" is no longer the test — "still exactly what the seed wrote" is. The
 * seed's record (pb-example-meta) names the roster and every sample player it
 * minted. One group, and it is that roster, still carrying the name the app
 * gave it, because renaming it is the smallest sign a host has started using
 * it. And every player still one of the seeded ones: deletions are fine, the
 * tour removes people, but a single player somebody typed in is the whole of
 * what a merge could have saved, and the question gets asked.
 *
 * This is not "the device looks quiet", it is "there is provably nothing here
 * to lose".
 */
function untouchedExampleInstall(): boolean {
  const { rosters, players } = snapshotNow();
  const meta = stores.exampleMeta.get();
  if (meta) {
    const seeded = new Set(meta.playerIds);
    return (
      rosters.length === 1 &&
      rosters[0].id === meta.rosterId &&
      rosters[0].name === EXAMPLE_GROUP_NAME &&
      players.every((p) => seeded.has(p.id))
    );
  }
  // Installs from before the example group existed opened on one empty group
  // named "My First Group". A never-used one is the same provable nothing it
  // always was, so it keeps the silent path it always had.
  return players.length === 0 && rosters.length === 1 && rosters[0].name === 'My First Group';
}

/**
 * Puts the question, using the data as it stands at this moment.
 *
 * The account side is frozen in `choice.server`, which is right: that snapshot
 * is the one the merge itself will use, so freezing it is what keeps the screen
 * and the outcome agreed. The device side cannot be frozen the same way.
 * combineWithAccount writes its plan back over the stores, so planning from a
 * stale copy of them would delete anything added since, which is a far worse
 * fault than the one being fixed here.
 *
 * So the device side is re-read instead, here and again when it changes. It does
 * change: the question is raised at the app's first render rather than on
 * opening My Account, an unanswered one survives a relaunch, and nothing stops
 * anybody using the app in the meantime. The duplicate names are the part that
 * has to keep up. They are the whole of the protection against two different
 * people with the same name becoming one, and that protection is consent, which
 * is worth nothing if it was given to an out of date list.
 */
function askChoice() {
  if (!choice) return;
  const local = snapshotNow();
  setStatus({
    state: 'choice',
    reason: choice.reason,
    account: counts(choice.server),
    device: counts(local),
    matched: planMerge(local, choice.server).matched.players
  });
}

function stopWatchingChoice() {
  for (const off of unwatchChoice) off();
  unwatchChoice = [];
}

function clearChoice() {
  choice = null;
  stopWatchingChoice();
}

async function onSignedIn(id: string) {
  if (userId === id) return;
  userId = id;

  const owner = account.get();

  if (owner === id) {
    cancelRetry();
    startTracking();
    settle();
    void syncNow();
    return;
  }

  setStatus({ state: 'starting' });
  try {
    const supabase = await getSupabase();
    const pulled = await fetchSince(supabase, null);
    const server = liveSnapshot(pulled);
    const bare = server.rosters.length === 0 && server.players.length === 0;

    // A device that has never synced, meeting an account with nothing on it.
    // There is nothing to reconcile, so this is silent, and it is the common
    // case: one person, one account, a second device.
    if (owner === null && bare) {
      account.set(id);
      if (pulled.cursor) cursorFor(id).set(pulled.cursor);
      mirror.set({ rosters: [], players: [] });
      // Tracking starts before the seed is queued, so an edit made while the
      // first push is in flight lands in the outbox rather than falling in the
      // gap between the snapshot and the subscription.
      startTracking();
      seed();
      cancelRetry();
      await flush();
      return;
    }

    const reason = owner === null ? ('server-has-data' as const) : ('other-account' as const);

    // Nothing on this device but what the fresh-install seed wrote.
    //
    // The question below is worth asking when both sides hold something. Here
    // one side holds nothing anybody made: sample players cannot be folded
    // into anybody's groups and cannot be lost by taking theirs. So the
    // account's copy is taken whole, silently, and the example goes with it —
    // it is replaced rather than deleted, because adoptAccountCopy sets the
    // roster list rather than editing it.
    //
    // Asking here offered a choice between the groups somebody already has and
    // two dozen players they never made, phrased as a warning about their own
    // data. It has one sensible answer, and a first sign-in is the worst
    // moment to hand someone a decision they cannot lose by getting wrong.
    if (untouchedExampleInstall()) {
      choice = { id, reason, server, preferences: pulled.preferences, cursor: pulled.cursor };
      cancelRetry();
      await adoptAccountCopy();
      return;
    }

    // Either the account already holds groups, or this device's groups were
    // last saved to somebody else's. Both need an answer no code should give on
    // the user's behalf: one would fold two people's data together, the other
    // would throw one of them away.
    choice = {
      id,
      reason,
      server,
      preferences: pulled.preferences,
      cursor: pulled.cursor
    };
    cancelRetry();
    // Asked before watched, not after. A store re-reads storage only while
    // nothing is subscribed to it, so subscribing first would make whatever the
    // cache happened to be holding authoritative and ask the question about it.
    askChoice();
    // Only the two stores the question is about. A rating typed while it waits
    // changes no count and folds no duplicate, and rewording the question under
    // somebody mid-read is its own small harm.
    unwatchChoice = [
      stores.rosters.subscribe(askChoice),
      stores.players.subscribe(askChoice)
    ];
  } catch (error) {
    // The decision could not be made, so this device does not yet know what it
    // is. Releasing the id is the point: onSignedIn returns early when it is
    // already set, so leaving it would wedge sync for the rest of the session —
    // one bad moment of signal at exactly the wrong second and nothing would
    // ever be saved, while the panel claimed it was trying.
    userId = null;
    setStatus({
      state: 'unready',
      problem: looksOffline(error)
        ? "You're offline, so nothing has been sent up yet. Trying again."
        : "Couldn't check your account. Nothing has been sent up yet. Trying again.",
      detail: raw(error) || null
    });
    scheduleRetry(id);
  }
}

// ---------------------------------------------------------------- the merge --

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Takes the account over as this device's, whichever way the user answered.
 *
 * The outbox is emptied first in both directions. In the other-account case it
 * holds rows belonging to the person who was signed in before, and sending
 * those into this account is the one mistake with no way back. In the
 * server-has-data case the merge has just recomputed everything those rows were
 * describing, so they are stale rather than dangerous.
 */
function claim(id: string, cursor: string | null) {
  account.set(id);
  if (cursor) cursorFor(id).set(cursor);
  else cursorFor(id).set(null);
}

export async function combineWithAccount(): Promise<SyncReport> {
  const answered = choice;
  if (!answered) return { title: 'Nothing to combine.', details: [] };

  const local = snapshotNow();
  const plan = planMerge(local, answered.server);

  // Before a single store is written. The question is being answered, so it
  // must stop rewording itself against the answer landing underneath it.
  stopWatchingChoice();
  outbox.set({});
  stopTracking();

  applying = true;
  try {
    stores.rosters.set(plan.rosters);
    stores.players.set(plan.players);
    // Adopted ids leave dangling references behind in the live session. The
    // schedule would still draw, because it holds whole player objects, but
    // partnerships would stop applying and the sat-out list would read as
    // empty. Nothing would look wrong, which is the worst kind of wrong.
    const session = remapSession(
      {
        activeRosterId: stores.activeRosterId.get(),
        scheduleRosterId: stores.scheduleRosterId.get(),
        schedule: stores.schedule.get(),
        selectedIds: stores.selectedIds.get(),
        removedIds: stores.removedIds.get(),
        partnerships: stores.partnerships.get()
      },
      plan.changes
    );
    stores.scheduleRosterId.set(session.scheduleRosterId);
    stores.schedule.set(session.schedule);
    stores.selectedIds.set(session.selectedIds);
    stores.removedIds.set(session.removedIds);
    stores.partnerships.set(session.partnerships);
    // And every group the host is not looking at, which refers to the same
    // players and is filed under a group id that may itself have been adopted.
    stores.groupSessions.set(remapParked(stores.groupSessions.get(), plan.changes));
    stores.activeRosterId.set(
      plan.rosters.some((r) => r.id === session.activeRosterId)
        ? session.activeRosterId
        : (plan.rosters[0]?.id ?? session.activeRosterId)
    );

    // The account's preferences win. They are single scalars, trivially re-set,
    // and not worth a second question.
    if (answered.preferences) applyPreferences(answered.preferences, true);
  } finally {
    applying = false;
  }

  claim(answered.id, answered.cursor);
  mirror.set({ rosters: plan.rosters, players: plan.players });
  startTracking();

  const at = stamp();
  enqueue([
    ...plan.push.rosters.map((roster) => ({
      table: 'rosters' as const,
      id: roster.id,
      row: rosterRow(roster, at)
    })),
    ...plan.push.players.map((player) => ({
      table: 'players' as const,
      id: player.id,
      row: playerRow(player, at)
    }))
  ]);

  clearChoice();
  settle();
  await flush();

  const details = [
    `${plural(plan.rosters.length, 'group', 'groups')} and ${plural(plan.players.length, 'player', 'players')} on this device now.`
  ];
  if (plan.matched.players.length > 0) {
    details.push(`Held on both, now one: ${plan.matched.players.join(', ')}.`);
  }
  if (plan.push.rosters.length + plan.push.players.length > 0) {
    details.push(
      `${plural(plan.push.rosters.length + plan.push.players.length, 'row', 'rows')} sent up to your account.`
    );
  }
  return { title: 'Combined.', details };
}

export async function adoptAccountCopy(): Promise<SyncReport> {
  const answered = choice;
  if (!answered) return { title: 'Nothing to replace.', details: [] };

  stopWatchingChoice();
  outbox.set({});
  stopTracking();

  applying = true;
  try {
    // The account may be empty, which is a real answer on a shared device: the
    // person signing in has nothing yet. The app still needs one group to open
    // on. Not the example group — this person has an account, they are past
    // being toured — so a plain empty one.
    stores.rosters.set(
      answered.server.rosters.length > 0
        ? answered.server.rosters
        : [{ id: 'default', name: EMPTY_GROUP_NAME }]
    );
    stores.players.set(answered.server.players);
    stores.activeRosterId.set(stores.rosters.get()[0]?.id ?? 'default');

    // The example the seed wrote is gone with everything else, so its record
    // goes too. Left behind, the silent-adoption test above could mistake a
    // future state for an untouched install.
    stores.exampleMeta.set(null);

    // Every id the session referred to has just gone. Clearing it is honest;
    // leaving it would show a schedule of people who are no longer in the pool.
    stores.schedule.set(null);
    stores.scheduleRosterId.set(null);
    stores.scheduleEdited.set(false);
    stores.completedRounds.set([]);
    stores.selectedIds.set([]);
    stores.removedIds.set([]);
    stores.partnerships.set([]);
    // The session's own name, and the people who were only in it. Both were
    // being left behind, which cost nothing while nothing read them. Sharing
    // reads both, so a session adopted away would have left a published copy
    // naming a schedule this device no longer has.
    stores.sessionId.set(null);
    stores.guests.set([]);
    stores.step.set('roster');
    stores.setupSeen.set(false);

    if (answered.preferences) applyPreferences(answered.preferences, true);

    // Last, because applyPreferences may have changed groups on the way past and
    // parked this empty session on its way. Every parked group goes the same way
    // as the live one did, and for the same reason: the ids they were built from
    // are no longer in the pool.
    stores.groupSessions.set({});
  } finally {
    applying = false;
  }

  claim(answered.id, answered.cursor);
  mirror.set(snapshotNow());
  startTracking();

  clearChoice();
  settle();
  await flush();

  return {
    title: 'Using your account.',
    details: [
      `${plural(stores.rosters.get().length, 'group', 'groups')} and ${plural(stores.players.get().length, 'player', 'players')} on this device now.`
    ]
  };
}

// ---------------------------------------------------------------- the retry --

/**
 * How long to wait before asking again, doubling up to a ceiling. Sync has
 * nothing urgent to do — the data is safe on the device either way — so the
 * failure mode to avoid is a phone with no signal retrying in a tight loop
 * until its battery is flat.
 */
const RETRY_BASE_MS = 15_000;
const RETRY_CAP_MS = 5 * 60_000;

let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(id: string) {
  if (retryTimer) clearTimeout(retryTimer);
  const wait = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS);
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    const auth = authStore.get();
    // Only if the same person is still signed in. Retrying against a session
    // that has since changed hands is how one account's data reaches another.
    if (auth.status === 'signed-in' && auth.userId === id) void onSignedIn(id);
  }, wait);
}

/**
 * Clears both backoffs: the one above, and the push retry's counter.
 *
 * Every caller is a moment when the waiting stopped meaning anything — sync got
 * going, the network came back, or the session ended. Leaving the push counter
 * climbing across those would make the first failure after a long-recovered dead
 * spot wait five minutes for no reason.
 */
function cancelRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  attempt = 0;
  pushAttempt = 0;
}

function onSignedOut() {
  userId = null;
  clearChoice();
  stopTracking();
  cancelRetry();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  // The outbox is kept. Those changes belong to the account, not to the
  // session, and signing back in should take them up rather than lose them.
  setStatus({ state: 'off' });
}

/**
 * Forgets the account this device was syncing with, without touching a single
 * group or player.
 *
 * Signing out deliberately keeps the outbox, because those changes belong to
 * the account and signing back in should take them up. Deleting the account is
 * the one case where that is wrong: there is nothing left to take them up, and
 * every one of them would be pushed into whichever account signed in next.
 *
 * So this clears the four things that name the dead account — the queue, the
 * owner marker, the mirror of what the server held, and the read cursor. The
 * groups and players stay exactly where they are, which is the promise the
 * delete screen makes.
 */
export function forgetAccount(): void {
  const id = account.get();
  onSignedOut();
  outbox.set({});
  account.set(null);
  mirror.set(null);
  if (id) {
    const cursor = cursorFor(id);
    cursors.delete(id);
    // Removed rather than set to null. The key is `pb-sync-cursor:<user id>`,
    // so leaving it behind would leave the deleted account's id sitting in
    // this browser after the account it named is gone.
    try {
      window.localStorage.removeItem(cursor.key);
    } catch {
      // Private-mode Safari. A stale cursor costs one full re-read, not a
      // wrong answer, so there is nothing to recover from here.
    }
  }
}

/**
 * Reads the auth store and does whatever it now implies. Safe to call at any
 * time: signing in twice for the same person is a no-op, and calling it after a
 * failed start is how a wedged device gets going again.
 */
function follow() {
  const auth = authStore.get();
  if (auth.status === 'signed-in') void onSignedIn(auth.userId);
  else if (auth.status === 'signed-out') onSignedOut();
}

// ---------------------------------------------------------------- the start --

let started = false;

/**
 * Separate from `started`, and deliberately not cleared by the test reset.
 *
 * These two listeners are module-global and anonymous, so there is no handle to
 * remove them with. A second startSync would leave two of each, and then one
 * `online` event would run the whole recovery twice over: two flushes racing,
 * the second one pushing the backoff counter up again just as the first reset
 * it. Registering once is the only way to be sure the count means anything.
 */
let listening = false;

/**
 * Called once, from the app's first render. Cheap for everyone it does not
 * apply to: with no env vars, the flag off, or nobody signed in on this
 * browser, it returns having imported nothing and touched no network.
 */
export function startSync(): void {
  if (started) return;
  started = true;
  if (!ACCOUNTS_ENABLED || !isSupabaseConfigured()) return;

  authStore.subscribe(follow);
  follow();

  // Only wake the client for somebody who is actually signed in.
  if (hasStoredSession() || hasAuthCallback()) void initAuth();

  if (listening) return;
  listening = true;

  // Coming back from a dead spot. follow() covers the case where the first
  // attempt never got far enough to know what this device was; syncNow covers
  // the ordinary backlog in both directions.
  window.addEventListener('online', () => {
    cancelRetry();
    follow();
    if (userId !== null) void syncNow();
  });

  // Coming back to the tab. This is what makes a phone edited at the court show
  // up on the desktop that has been sitting open all afternoon.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && userId !== null) void syncNow();
  });
}

/** Exported for the tests, which need to run more than one sign-in per process. */
export const __testing = {
  reset() {
    started = false;
    userId = null;
    pushing = false;
    pulling = false;
    applying = false;
    clearChoice();
    cursors.clear();
    stopTracking();
    cancelRetry();
    if (timer) clearTimeout(timer);
    timer = null;
    status = { state: 'off' };
  },
  follow,
  account,
  mirror,
  cursorFor,
  flush,
  pullNow,
  seed,
  preferencesRow
};
