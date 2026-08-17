import { ACCOUNTS_ENABLED } from './appInfo';
import { authStore } from './auth';
import {
  sessionSnapshot,
  withholdPrivate,
  type SessionSnapshot,
  type SharedRoundTimer
} from './sessionSnapshot';
import { isCode, sealCode } from './scoreCode';
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

/** Where the watchers' scores queue up until this phone takes them. */
const EDITS_TABLE = 'score_edits';

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

/**
 * How often to look for scores the watchers have left.
 *
 * Only while a share is live, the tab is in front and the host has switched
 * editing on, which together make this a poll almost nobody pays for. Twice as
 * often as the watchers poll, because this is the leg they wait on: their own
 * number does not come back to them until this phone has taken it and published
 * again.
 */
const DRAIN_MS = 10_000;

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
let drainTimer: ReturnType<typeof setInterval> | null = null;
let draining = false;

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
    scoringEnabled: stores.scoringEnabled.get(),
    scoreEditing: editingOn(),
    standingsShared: stores.standingsShared.get(),
    roundTimer: sharedRoundTimer()
  });
}

/**
 * The round timer as the watchers get it, or null when there is nothing to
 * send.
 *
 * Idle is nothing to send: the host has opened the panel and is still deciding
 * how long the round should be, and a clock appearing on nine other phones at
 * that moment would be announcing a decision nobody has made. Everything from
 * START onwards goes.
 */
function sharedRoundTimer(): SharedRoundTimer | null {
  const timer = stores.roundTimer.get();
  if (timer.roundNumber === null || timer.phase === 'idle') return null;

  return {
    roundNumber: timer.roundNumber,
    phase: timer.phase,
    endsAt: timer.endsAt,
    remainingMs: timer.remainingMs,
    flashOn: timer.flashOn,
    // What the watchers start from. The host is setting the alarm for a court,
    // not only for their own phone, so the phone on the bench should ring the
    // same way — and then anybody who wants it to stop can say so on theirs.
    soundOn: timer.soundOn,
    alarmTone: timer.alarmTone
  };
}

/**
 * Whether a watcher could change a score right now: the switch on, and four
 * digits actually typed. Half a code is not a code, and a session that offered
 * to take one while the host was still typing would be asking for something
 * nobody could give.
 */
function editingOn(): boolean {
  return stores.scoreEditingAllowed.get() && isCode(stores.scoreEditCode.get());
}

async function row(shareKey: string, snapshot: SessionSnapshot) {
  // The one place the code turns into something publishable. Note what is not
  // here: the code itself. sealCode() gives back a salt and a hash, and the
  // database recomputes the same sum rather than ever being told the digits.
  const sealed = stores.scoreEditingAllowed.get()
    ? await sealCode(stores.scoreEditCode.get())
    : null;

  return {
    share_key: shareKey,
    // A schedule generated before sessions were named has none. The share key
    // stands in: this column exists to recognise one afternoon across a stop
    // and a restart, and with no session id there is nothing to recognise.
    session_id: snapshot.sessionId ?? shareKey,
    // The one place a session leaves the device, and the only caller of this.
    //
    // The flag is settled here rather than taken from the snapshot as built,
    // so that what the document promises and what the columns can deliver are
    // the same fact. A watcher told editing is on when no hash went with it
    // would be offered a prompt no code could answer.
    snapshot: { ...withholdPrivate(snapshot), scoreEditing: sealed !== null },
    expires_at: new Date(Date.now() + SHARE_HOURS * 3600_000).toISOString(),
    updated_at: snapshot.at,
    // Always both, and null when editing is off. An upsert writes only the
    // columns it is given, so leaving these out would leave this morning's
    // hash sitting on the row and the switch would switch nothing off.
    score_code_hash: sealed?.hash ?? null,
    score_code_salt: sealed?.salt ?? null
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
    const { error } = await supabase.from(TABLE).upsert(await row(key, snapshot), {
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

// ------------------------------------------------- taking the edits offered --

/** One row of score_edits, as the host reads it back. */
interface QueuedEdit {
  id: number;
  round_index: number;
  court_index: number;
  team1: number;
  team2: number;
}

/**
 * Writes what the watchers sent into the schedule on this phone.
 *
 * Last write wins, which is Jeff's call: they are applied oldest first, so two
 * people arguing about the same court end on whoever pressed Save last, and
 * anything the host types afterwards stands because the host is typing after
 * all of this.
 *
 * Returns whether anything actually moved. That answer matters: writing the
 * store is what schedules a publish, so a drain that changed nothing must not
 * write it, or a live share would republish itself every ten seconds until the
 * afternoon ended.
 */
function applyEdits(edits: QueuedEdit[]): boolean {
  const current = stores.schedule.get();
  if (!current) return false;

  const rounds = current.rounds.map((round) => ({ ...round, courts: [...round.courts] }));
  let moved = false;

  for (const edit of edits) {
    // A court that has since been taken away, or a whole round that has. The
    // row is still deleted by the caller: it is an edit to something that is
    // no longer there, and keeping it would only apply it to whatever moved
    // into that position later.
    const round = rounds[edit.round_index];
    const court = round?.courts[edit.court_index];
    if (!court) continue;

    // Already what it says. Re-reading a row whose delete failed is the usual
    // way here, and it must not count as a change.
    if (court.score?.team1 === edit.team1 && court.score?.team2 === edit.team2) continue;

    round.courts[edit.court_index] = {
      ...court,
      score: { team1: edit.team1, team2: edit.team2 }
    };
    moved = true;
  }

  if (moved) stores.schedule.set({ ...current, rounds });
  return moved;
}

/**
 * Take whatever is queued, and clear it.
 *
 * Applied first and deleted afterwards, so a delete that never lands means the
 * next pass applies the same numbers over the same numbers and stops. The other
 * order would lose an edit outright on a connection that dropped between the
 * two requests.
 *
 * With editing switched off the queue is emptied without being read into the
 * schedule. Those rows were sent to a host who has since said they do not want
 * them, and leaving them would mean a switch turned back on next Tuesday
 * applied a score from today.
 */
async function drain(): Promise<void> {
  if (key === null || draining) return;
  if (authStore.get().status !== 'signed-in') return;
  // A phone in a pocket. The visibility handler brings this back the moment it
  // is looked at, which is also when the host would care.
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

  const going = key;
  draining = true;
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from(EDITS_TABLE)
      .select('id, round_index, court_index, team1, team2')
      .eq('share_key', going)
      .order('id', { ascending: true });
    if (error) throw new Error(error.message);

    const queued = (data ?? []) as QueuedEdit[];
    if (queued.length === 0) return;

    if (stores.scoreEditingAllowed.get()) applyEdits(queued);

    await supabase
      .from(EDITS_TABLE)
      .delete()
      .in('id', queued.map((edit) => edit.id));
  } catch {
    // Nothing to say and nothing to show. The rows are still there and the next
    // pass is ten seconds away; a share that cannot reach the database has a
    // publish failing loudly on the same card already.
  } finally {
    draining = false;
  }
}

/**
 * Starts and stops the polling to match the switch.
 *
 * Called wherever the switch could have moved, which is every store change, so
 * turning editing on begins looking immediately rather than at the top of some
 * interval that was already running.
 */
function syncDraining() {
  const wanted = key !== null && stores.scoreEditingAllowed.get();

  if (wanted && drainTimer === null) {
    drainTimer = setInterval(() => void drain(), DRAIN_MS);
    return;
  }
  if (!wanted && drainTimer !== null) {
    clearInterval(drainTimer);
    drainTimer = null;
    // Switched off with people still watching. Empty the queue rather than
    // leave it for a switch that comes back on.
    void drain();
  }
}

// ----------------------------------------------------------- what to watch --

/**
 * Everything a watching phone would notice. The schedule carries the courts and
 * the scores; the rest is who is in the session and whether it keeps score at
 * all.
 *
 * The last two are the score-editing switch and the code behind it. They are
 * here because they are published — as a flag on the document and as a salted
 * hash on the row — so a host who types a code and is never republished has set
 * a code that opens nothing.
 */
const WATCHED = [
  stores.schedule,
  stores.completedRounds,
  stores.selectedIds,
  stores.removedIds,
  stores.guests,
  stores.players,
  stores.scoringEnabled,
  stores.scoreEditingAllowed,
  stores.scoreEditCode,
  // Watched for the same reason as the two above it: it is published on the
  // document, so a host who moves the switch and is never republished has
  // taken the standings off nobody's phone.
  stores.standingsShared
];

/**
 * The round timer is watched apart from the list above, through a filter.
 *
 * Most of what that store holds is never published — the minutes, the tone,
 * whether the host's own phone makes a noise — and the minutes in particular
 * move on every tap of a stepper. Sending the whole session up because
 * somebody is thumbing 12 up to 15 would be a dozen uploads for a decision
 * nobody outside this phone can see. So this compares what would actually go
 * on the wire and stays quiet unless that changed, which in practice is START,
 * STOP, RESET and reaching zero.
 */
let lastTimer: string | null = null;

function onTimerChange() {
  const next = JSON.stringify(sharedRoundTimer());
  if (next === lastTimer) return;
  lastTimer = next;
  // Straight out, without the debounce the rest of the session publishes on.
  // That delay exists to make a burst of taps one upload, and this is not a
  // burst: what gets here is START, STOP, RESET and reaching zero, each of them
  // one deliberate press, already filtered to what would actually go on the
  // wire. It is also the one change on the sheet that a court full of people
  // is waiting on, so a second and a half is a second and a half of everybody
  // looking at a phone that has not caught up yet.
  onChange(0);
}

function startTracking() {
  if (untrack.length > 0) return;
  for (const store of WATCHED) {
    untrack.push(store.subscribe(onChange));
  }
  lastTimer = JSON.stringify(sharedRoundTimer());
  untrack.push(stores.roundTimer.subscribe(onTimerChange));
  syncDraining();
}

function stopTracking() {
  for (const off of untrack) off();
  untrack = [];
  lastTimer = null;
  if (timer) clearTimeout(timer);
  timer = null;
  // Straight off rather than through syncDraining(), which would empty a queue
  // that is about to be deleted along with the share it hangs off.
  if (drainTimer) clearInterval(drainTimer);
  drainTimer = null;
}

function onChange(delay = PUBLISH_DELAY_MS) {
  if (key === null) return;
  // The session is over, however it ended: New Round Robin, a group switch, a
  // deleted group, or sync adopting an account copy. All four null the schedule,
  // which is why this is the only teardown in the file.
  if (stores.schedule.get() === null) {
    void stopSharing();
    return;
  }
  syncDraining();
  schedulePublish(delay);
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
      const { error } = await supabase.from(TABLE).insert(await row(minted, snapshot));
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
 * Forgets the score-editing switch and the code that went with it.
 *
 * Called wherever a share ends. The code is only ever meaningful against the
 * link it was set for: a new session gets a new key, and a code left lying
 * about would be one the host had told a different set of people, on a
 * different afternoon, and had no reason to think was still live.
 */
function forgetScoreEditing() {
  stores.scoreEditingAllowed.set(false);
  stores.scoreEditCode.set(null);
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
  forgetScoreEditing();
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
      forgetScoreEditing();
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
      forgetScoreEditing();
      setStatus({ state: 'off' });
    }
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      // A phone that slept through two rounds catches up the moment it wakes,
      // in both directions: what it has to say, and what was left for it.
      if (document.visibilityState !== 'visible' || key === null) return;
      schedulePublish(0);
      void drain();
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
    draining = false;
    started = false;
    status = { state: 'off' };
    listeners.clear();
  },
  publishNow: () => publish(),
  drainNow: () => drain(),
  rowFor: (shareKey: string) => {
    const snapshot = currentSnapshot();
    return snapshot ? row(shareKey, snapshot) : null;
  },
  get key() {
    return key;
  },
  get draining() {
    return drainTimer !== null;
  },
  adopt(minted: string) {
    key = minted;
    stores.shareKey.set(minted);
    startTracking();
  }
};
