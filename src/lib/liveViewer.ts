import {
  SNAPSHOT_VERSION,
  type SessionSnapshot,
  type SharedRoundTimer
} from './sessionSnapshot';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { CourtAssignment, Player, Round } from '../types';

/**
 * Reading somebody else's session.
 *
 * The other end of liveSession.ts, and the only part of this app that runs for
 * a person with no account. It asks the database one question — what is behind
 * this key — and gets back a snapshot or nothing.
 *
 * Everything it gets back is checked before it is handed on. That is not
 * ceremony: this is the one document in the app that arrives over a network
 * rather than out of the browser's own storage, and the viewer walks straight
 * into `schedule.rounds[i].courts[j].team1`. A snapshot written by a newer
 * version of the app, or truncated, or simply not one, has to end as a sentence
 * on screen rather than as a stack trace inside ErrorBoundary.
 */

export type LiveFetch =
  /** There is a session behind this key and here it is. */
  | { state: 'ok'; snapshot: SessionSnapshot }
  /** No such key, or it has expired, or the host stopped sharing. */
  | { state: 'gone' }
  /** Written by a newer app than this one, so it cannot be trusted to render. */
  | { state: 'outdated' }
  | { state: 'offline' }
  | { state: 'error'; message: string };

export async function fetchShared(key: string): Promise<LiveFetch> {
  if (!isSupabaseConfigured()) {
    return { state: 'error', message: 'Shared sessions are not available here.' };
  }

  try {
    // getSupabase() is one client for the whole page, and it keeps whatever
    // session is in storage. So a host who opens their own link arrives here
    // carrying their own token while a player arrives with none. It makes no
    // difference: shared_session is a security definer function, so it answers
    // the same question the same way either way. This looks like a bug and is
    // not.
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('shared_session', { key });
    if (error) throw new Error(error.message);

    // Null covers all three endings on purpose. The function will not say
    // whether a key was ever real, because that is exactly what somebody
    // working through the key space would want to be told.
    if (data === null || data === undefined) return { state: 'gone' };

    return read(data);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error ?? '');
    if (looksOffline(text)) return { state: 'offline' };
    return { state: 'error', message: 'Could not load this session just now.' };
  }
}

/**
 * The cheap half of fetchShared: when this session was last published, and
 * nothing else.
 *
 * A watching page asks this every few seconds and only pulls the document when
 * the answer moves. The document is the whole session — around 8KB — and it was
 * the size of it that set the twenty second poll, which in turn was why the
 * host's round timer took about twelve seconds to reach anybody. A timestamp is
 * tens of bytes, so it can be asked for often enough that the timer arrives
 * while the host still has their thumb on the button.
 *
 * 'unavailable' rather than an error, because the one way this fails in
 * practice is a database that has not had 0009 run against it yet. The caller
 * treats that as "no probe here" and goes back to polling the document on the
 * old cadence, so the two halves can ship in either order.
 */
export type LiveProbe =
  /** Epoch ms of the last publish, to compare against a snapshot's own `at`. */
  | { state: 'at'; at: number }
  /** No such key, expired, or stopped. The three are one answer, as always. */
  | { state: 'gone' }
  | { state: 'unavailable' };

export async function fetchSharedAt(key: string): Promise<LiveProbe> {
  if (!isSupabaseConfigured()) return { state: 'unavailable' };

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('shared_session_at', { key });
    if (error) throw new Error(error.message);
    if (data === null || data === undefined) return { state: 'gone' };

    // Postgres hands back a timestamptz, which is not the string the client
    // sent even though it is the same instant. Compared as instants, not as
    // text: the column is written from snapshot.at, and both sides survive the
    // trip at millisecond precision.
    const at = Date.parse(String(data));
    if (Number.isNaN(at)) return { state: 'unavailable' };
    return { state: 'at', at };
  } catch {
    // Offline is 'unavailable' too. There is nothing to show for a failed
    // probe — the document already on screen is the last thing known to be
    // true — and the fetch that follows has somewhere to say so.
    return { state: 'unavailable' };
  }
}

function looksOffline(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('load failed') ||
    lower.includes('offline')
  );
}

// ------------------------------------------------------------- reading it --

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isPlayer(value: unknown): value is Player {
  if (typeof value !== 'object' || value === null) return false;
  const player = value as Partial<Player>;
  return typeof player.id === 'string' && typeof player.name === 'string';
}

function isCourt(value: unknown): value is CourtAssignment {
  if (typeof value !== 'object' || value === null) return false;
  const court = value as Partial<CourtAssignment>;
  return (
    typeof court.courtNumber === 'number' &&
    isArray(court.team1) &&
    court.team1.every(isPlayer) &&
    isArray(court.team2) &&
    court.team2.every(isPlayer)
  );
}

function isRound(value: unknown): value is Round {
  if (typeof value !== 'object' || value === null) return false;
  const round = value as Partial<Round>;
  return (
    typeof round.roundNumber === 'number' &&
    isArray(round.courts) &&
    round.courts.every(isCourt) &&
    isArray(round.sitOuts) &&
    round.sitOuts.every(isPlayer)
  );
}

/**
 * The host's timer, or null for every session that has none — which is most of
 * them, and all of them published before the timer existed.
 *
 * Checked rather than trusted for the same reason the rounds are: this arrives
 * over a network, and the viewer divides by it and draws it at the size of a
 * scoreboard. A malformed one is dropped on its own, leaving the rest of the
 * session perfectly readable, because a session is still worth watching
 * without a countdown on it.
 */
function readTimer(value: unknown): SharedRoundTimer | null {
  if (typeof value !== 'object' || value === null) return null;
  const timer = value as Partial<SharedRoundTimer>;

  if (typeof timer.roundNumber !== 'number') return null;
  if (timer.phase !== 'running' && timer.phase !== 'paused' && timer.phase !== 'alarming') {
    return null;
  }
  // Running without a deadline is the one combination that cannot be drawn:
  // there would be nothing to count towards.
  const endsAt = typeof timer.endsAt === 'number' ? timer.endsAt : null;
  if (timer.phase === 'running' && endsAt === null) return null;

  return {
    roundNumber: timer.roundNumber,
    phase: timer.phase,
    endsAt,
    remainingMs: typeof timer.remainingMs === 'number' ? Math.max(0, timer.remainingMs) : 0,
    flashOn: timer.flashOn === true,
    // Not `=== true`, unlike everything above it. The strict test is right for
    // a field whose absence should mean off; this one's absence means an older
    // document that predates it, and the host's own default is on. A watcher
    // who wants silence has a switch of their own.
    soundOn: timer.soundOn !== false,
    // resolveTone at the point of use rather than here, so a tone this build
    // has never heard of still arrives intact for the picker to fall back from.
    alarmTone: typeof timer.alarmTone === 'string' ? timer.alarmTone : undefined
  };
}

/**
 * Turns whatever came back into a snapshot, or says why it will not.
 *
 * Only the fields the viewer actually walks into are checked. `rating` and
 * `rosterIds` are not among them, deliberately: the publisher strips both, so a
 * document that still carries them is an older one rather than a broken one,
 * and refusing it would break links that work.
 */
export function read(value: unknown): LiveFetch {
  if (typeof value !== 'object' || value === null) return { state: 'gone' };

  const document = value as Partial<SessionSnapshot>;

  // Greater, not different. This app can read everything it has ever written,
  // and the number only goes up.
  if (typeof document.version !== 'number') return { state: 'gone' };
  if (document.version > SNAPSHOT_VERSION) return { state: 'outdated' };

  const schedule = document.schedule;
  if (typeof schedule !== 'object' || schedule === null) return { state: 'gone' };
  if (!isArray(schedule.rounds) || !schedule.rounds.every(isRound)) return { state: 'gone' };
  if (!isArray(document.players) || !document.players.every(isPlayer)) return { state: 'gone' };

  return {
    state: 'ok',
    snapshot: {
      version: document.version,
      at: typeof document.at === 'string' ? document.at : '',
      sessionId: typeof document.sessionId === 'string' ? document.sessionId : null,
      schedule: { rounds: schedule.rounds },
      completedRounds: isArray(document.completedRounds)
        ? document.completedRounds.filter((n): n is number => typeof n === 'number')
        : [],
      players: document.players,
      scoringEnabled: document.scoringEnabled === true,
      // Absent on every session published before editing existed, and that
      // absence means off. Read the same way as scoringEnabled beside it:
      // strictly true, so a field that arrives as a string or a number does
      // not open a prompt.
      scoreEditing: document.scoreEditing === true,
      roundTimer: readTimer(document.roundTimer)
    }
  };
}

// --------------------------------------------------- changing what is there --

/**
 * The two calls behind a watcher editing a score.
 *
 * Both take the share key and the code together, because holding the two is the
 * whole permission model — the same shape reading chose. Neither is given a row
 * id, so there is nothing to aim at a session whose key you do not hold.
 *
 * The code is never checked here. `share_code_ok` and `submit_score_edit` are
 * security definer functions that recompute the hash themselves, and
 * submit_score_edit checks the code again rather than trusting a caller that
 * says it already passed. A caller that says so is exactly what somebody
 * skipping the prompt would write.
 */

export type CodeCheck =
  /** The code opens this share. */
  | 'ok'
  /** Wrong code, or a share that has ended, or one where editing is off. */
  | 'wrong'
  | 'offline'
  | 'error';

export async function checkCode(key: string, code: string): Promise<CodeCheck> {
  if (!isSupabaseConfigured()) return 'error';

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('share_code_ok', { key, code });
    if (error) throw new Error(error.message);
    return data === true ? 'ok' : 'wrong';
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error ?? '');
    return looksOffline(text) ? 'offline' : 'error';
  }
}

export type EditResult =
  /** Queued. The host's phone takes it from there. */
  | 'saved'
  /**
   * The database would not have it: the code has stopped working, the host has
   * switched editing off or stopped sharing, or the queue is at its cap. One
   * answer for all of them, because the caller cannot do anything different
   * about any of them and the difference is not a watcher's business.
   */
  | 'refused'
  | 'offline'
  | 'error';

export async function submitScoreEdit(
  key: string,
  code: string,
  roundIndex: number,
  courtIndex: number,
  team1: number,
  team2: number
): Promise<EditResult> {
  if (!isSupabaseConfigured()) return 'error';

  try {
    const supabase = await getSupabase();
    // The argument names are the function's, and they are deliberately not the
    // column names. See the note in 0007 about what a shadowed name costs.
    const { data, error } = await supabase.rpc('submit_score_edit', {
      key,
      code,
      round_idx: roundIndex,
      court_idx: courtIndex,
      score1: team1,
      score2: team2
    });
    if (error) throw new Error(error.message);
    return data === true ? 'saved' : 'refused';
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error ?? '');
    return looksOffline(text) ? 'offline' : 'error';
  }
}
