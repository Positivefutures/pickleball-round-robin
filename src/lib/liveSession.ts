import { ACCOUNTS_ENABLED } from './appInfo';
import { authStore } from './auth';
import { sessionSnapshot, withholdPrivate, type SessionSnapshot } from './sessionSnapshot';
import { isShareKey, mintShareKey, shareUrl } from './shareKey';
import * as stores from './stores';
import { getSupabase, isSupabaseConfigured } from './supabase';

/**
 * Publishing the session being run right now, so the people in it can watch it
 * on their own phones.
 *
 * Deliberately not part of sync.ts. That file watches the person's data —
 * groups, players, preferences — and says so at length: a live session belongs
 * to the device it is being run on, and two phones at one court disagreeing
 * about round three is a conflict with no sensible answer. Nothing here changes
 * that. The session still lives on the host's phone; this only sends copies of
 * it out, one way, for other people to read.
 *
 * ## Where the seam is
 *
 * The obvious place to publish from is SchedulePage's onUpdateSchedule, and
 * that file says as much. It is the wrong place: it catches four of the
 * thirteen sites in App that set a schedule. A reshuffle, an added court, a
 * substitution and nine others go round it, and each one would be a change the
 * watching phones never saw.
 *
 * So this subscribes to the stores instead, which every one of those thirteen
 * has to go through. It is the same trick startTracking() in sync.ts uses, and
 * it also gets teardown for nothing: when a session ends the schedule becomes
 * null, wherever that happened, and the share can take itself down without
 * clearSession or adoptAccountCopy having to remember to say so.
 *
 * ## What is published
 *
 * Never the snapshot as built. withholdPrivate() takes the ratings out first,
 * and it is the only route from here to the wire.
 */

const TABLE = 'shared_sessions';

/** The client asks for a day. The database clamps anything longer. */
const SHARE_HOURS = 24;

/**
 * How many keys to try before giving up. A collision means the ten characters
 * just minted are already somebody else's, which at 2^50 will not happen; three
 * is here so that a bug which made minting return a constant fails loudly
 * instead of looping.
 */
const MINT_ATTEMPTS = 3;

/** Long enough that a burst of taps is one upload. Matches sync's FLUSH_DELAY_MS. */
const PUBLISH_DELAY_MS = 1500;

/**
 * A failed publish comes back on its own, doubling to a ceiling. Same reasoning
 * as sync's push retry: the session is safe on the phone either way, so the
 * failure to avoid is one that flattens a battery at a court with one bar.
 */
const RETRY_BASE_MS = 15_000;
const RETRY_CAP_MS = 5 * 60_000;

export type LiveStatus =
  | { state: 'off' }
  | { state: 'starting' }
  | { state: 'publishing'; url: string }
  | { state: 'live'; url: string; at: string }
  | { state: 'problem'; url: string | null; message: string };

let status: LiveStatus = { state: 'off' };
const listeners = new Set<() => void>();

function setStatus(next: LiveStatus) {
  status = next;
  for (const listener of listeners) listener();
}

/** Shaped for useSyncExternalStore, like authStore and syncStatusStore. */
export const liveStatusStore = {
  get: (): LiveStatus => status,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};

let key: string | null = null;
let untrack: (() => void)[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let publishing = false;
let started = false;

// ------------------------------------------------------------ the document --

/**
 * The session as it stands, or null when there is not one.
 *
 * `players` is built here rather than taken from what SchedulePage is given.
 * That prop is attendingPlayers, which has removedIds filtered out, and a
 * snapshot is supposed to carry anyone who has gone home — they are still in
 * the completed rounds and still in the standings. Everybody selected, guests
 * included, is the right list; guests are put into selectedIds when they are
 * added, so this catches them.
 */
function currentSnapshot(): SessionSnapshot | null {
  const schedule = stores.schedule.get();
  if (!schedule) return null;

  const selected = new Set(stores.selectedIds.get());
  const players = [...stores.players.get(), ...stores.guests.get()].filter((player) =>
    selected.has(player.id)
  );

  return sessionSnapshot({
    sessionId: stores.sessionId.get(),
    schedule,
    completedRounds: stores.completedRounds.get(),
    players,
    scoringEnabled: stores.scoringEnabled.get()
  });
}

function row(shareKey: string, snapshot: SessionSnapshot) {
  return {
    share_key: shareKey,
    // A schedule generated before sessions were named has none. The share key
    // stands in: this column exists to recognise one afternoon across a stop
    // and a restart, and with no session id there is nothing to recognise.
    session_id: snapshot.sessionId ?? shareKey,
    // The one place a session leaves the device, and the only caller of this.
    snapshot: withholdPrivate(snapshot),
    expires_at: new Date(Date.now() + SHARE_HOURS * 3600_000).toISOString(),
    updated_at: snapshot.at
    // user_id is deliberately absent. The column defaults to auth.uid() and the
    // with-check verifies it, so sending one could only ever be wrong.
  };
}

// -------------------------------------------------------------- publishing --

function schedulePublish(delay = PUBLISH_DELAY_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void publish();
  }, delay);
}

function scheduleRetry() {
  const wait = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS);
  attempt += 1;
  schedulePublish(wait);
}

async function publish(): Promise<void> {
  if (publishing || key === null) return;

  const snapshot = currentSnapshot();
  // The session ended between the change and this firing. teardown() has the
  // job of taking the share down; there is nothing to send.
  if (!snapshot) return;

  // Signed out, or not signed in yet at boot. Stay in publishing and wait to be
  // woken by the auth subscription rather than throwing a request at RLS that
  // can only be refused.
  if (authStore.get().status !== 'signed-in') return;

  const url = shareUrl(key);
  publishing = true;
  setStatus({ state: 'publishing', url });
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from(TABLE).upsert(row(key, snapshot), {
      onConflict: 'share_key'
    });
    if (error) throw new Error(error.message);
    attempt = 0;
    setStatus({ state: 'live', url, at: snapshot.at });
  } catch (error) {
    setStatus({ state: 'problem', url, message: describe(error) });
    scheduleRetry();
  } finally {
    publishing = false;
  }
}

// ----------------------------------------------------------- what to watch --

/**
 * Everything a watching phone would notice. The schedule carries the courts and
 * the scores; the rest is who is in the session and whether it keeps score at
 * all.
 */
const WATCHED = [
  stores.schedule,
  stores.completedRounds,
  stores.selectedIds,
  stores.removedIds,
  stores.guests,
  stores.players,
  stores.scoringEnabled
];

function startTracking() {
  if (untrack.length > 0) return;
  for (const store of WATCHED) {
    untrack.push(store.subscribe(onChange));
  }
}

function stopTracking() {
  for (const off of untrack) off();
  untrack = [];
  if (timer) clearTimeout(timer);
  timer = null;
}

function onChange() {
  if (key === null) return;
  // The session is over, however it ended: New Round Robin, a group switch, a
  // deleted group, or sync adopting an account copy. All four null the schedule,
  // which is why this is the only teardown in the file.
  if (stores.schedule.get() === null) {
    void stopSharing();
    return;
  }
  schedulePublish();
}

// ------------------------------------------------------------- the switches --

function available(): boolean {
  return ACCOUNTS_ENABLED && isSupabaseConfigured();
}

/**
 * Whether the Share card should offer to start. Not to be confused with
 * canShare() in share.ts, which asks whether this browser has an OS share sheet.
 */
export function sharingAvailable(): boolean {
  return available() && authStore.get().status === 'signed-in';
}

export async function startSharing(): Promise<void> {
  if (!available()) {
    setStatus({ state: 'problem', url: null, message: 'Sharing is not available.' });
    return;
  }
  if (authStore.get().status !== 'signed-in') {
    setStatus({ state: 'problem', url: null, message: 'Sign in to share this session.' });
    return;
  }

  const snapshot = currentSnapshot();
  if (!snapshot) {
    setStatus({ state: 'problem', url: null, message: 'There is no session to share yet.' });
    return;
  }

  setStatus({ state: 'starting' });
  try {
    const supabase = await getSupabase();
    let minted = mintShareKey();

    // Whatever this account had shared before, it is not sharing now. RLS scopes
    // the delete to its own rows, and PostgREST refuses a delete with no filter
    // at all, so the key about to be used is the thing to exclude. One row per
    // account is the real invariant; the cap in the migration is the backstop.
    await supabase.from(TABLE).delete().neq('share_key', minted);

    for (let tries = 0; tries < MINT_ATTEMPTS; tries++) {
      const { error } = await supabase.from(TABLE).insert(row(minted, snapshot));
      if (!error) {
        adopt(minted, snapshot.at);
        return;
      }
      // 23505 is a key already taken, and the row holding it is one RLS hides
      // from us, so there is nothing to do but pick another name.
      if (error.code !== '23505') throw new Error(error.message);
      minted = mintShareKey();
    }
    throw new Error('Could not make a link just now. Please try again.');
  } catch (error) {
    setStatus({ state: 'problem', url: null, message: describe(error) });
  }
}

function adopt(minted: string, at: string) {
  key = minted;
  stores.shareKey.set(minted);
  attempt = 0;
  startTracking();
  setStatus({ state: 'live', url: shareUrl(minted), at });
}

/**
 * Stop, and take the published copy down with it.
 *
 * The local end goes first and unconditionally. A host who has pressed Stop has
 * stopped, and leaving the switch on because a request failed would be the app
 * arguing with them. The row is deleted on a best effort, and if that request
 * never lands the database expires it within the day anyway.
 */
export async function stopSharing(): Promise<void> {
  const going = key;
  stopTracking();
  key = null;
  attempt = 0;
  stores.shareKey.set(null);
  setStatus({ state: 'off' });
  if (going === null) return;

  try {
    const supabase = await getSupabase();
    await supabase.from(TABLE).delete().eq('share_key', going);
  } catch {
    // Nothing to say. It expires on its own.
  }
}

/**
 * Picks a share back up after a reload, and keeps it in step with sign-in.
 *
 * Called once from App, beside startSync().
 */
export function startLive(): void {
  if (!available() || started) return;
  started = true;

  const saved = stores.shareKey.get();
  if (saved && isShareKey(saved)) {
    if (stores.schedule.get() === null) {
      // The session ended while the app was shut. Nothing to publish and no key
      // worth keeping; the row expires by itself.
      stores.shareKey.set(null);
    } else {
      key = saved;
      startTracking();
      setStatus({ state: 'publishing', url: shareUrl(saved) });
      // At boot the auth state is still 'unknown', so this will bounce off the
      // guard in publish() and be woken by the subscription below.
      schedulePublish(0);
    }
  }

  authStore.subscribe(() => {
    if (key === null) return;
    if (authStore.get().status === 'signed-in') {
      schedulePublish(0);
      return;
    }
    if (authStore.get().status === 'signed-out') {
      // Signed out mid-session. There is no longer a token to delete the row
      // with, so it is left to expire, and the local end simply stops.
      stopTracking();
      key = null;
      stores.shareKey.set(null);
      setStatus({ state: 'off' });
    }
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      // A phone that slept through two rounds catches up the moment it wakes.
      if (document.visibilityState === 'visible' && key !== null) schedulePublish(0);
    });
  }
}

// -------------------------------------------------------------------- errors --

/** Short, and about what to expect rather than what broke. */
function describe(error: unknown): string {
  // A browser with no cryptographic random source. Nothing to retry and nothing
  // to do about it, so say the true thing rather than blame the connection.
  if (error instanceof Error && error.name === 'NoRandomSource') return error.message;

  const text = raw(error).toLowerCase();
  if (
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('load failed') ||
    text.includes('offline')
  ) {
    return "You're offline. The link will catch up when you're back on.";
  }
  if (raw(error).startsWith('This account is full.')) return raw(error);
  return "Couldn't reach your account just now. Trying again.";
}

function raw(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

/** Reset between tests. Nothing in the app calls this. */
export const __testing = {
  reset() {
    stopTracking();
    key = null;
    attempt = 0;
    publishing = false;
    started = false;
    status = { state: 'off' };
    listeners.clear();
  },
  publishNow: () => publish(),
  get key() {
    return key;
  }
};
