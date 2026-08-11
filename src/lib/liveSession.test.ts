/**
 * @vitest-environment happy-dom
 *
 * Publishing the session being run right now.
 *
 * Three things here would be invisible on a host's screen and wrong on
 * everybody else's, and they are what most of these tests are about.
 *
 * The first is a change that never goes up. The publisher watches stores rather
 * than a callback precisely so that a reshuffle or an added court cannot slip
 * past, and only a test that pokes a store can show that it does not.
 *
 * The second is a share that outlives its session. A link still answering after
 * Start New Session shows a room a schedule nobody is playing.
 *
 * The third is a rating leaving the device, which nothing on screen would ever
 * reveal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthState } from './auth';
import type { Player, Schedule } from '../types';

// ------------------------------------------------------------ a fake server --

interface Row {
  share_key: string;
  session_id: string;
  snapshot: unknown;
  expires_at: string;
  updated_at: string;
  [key: string]: unknown;
}

type Fault = { code?: string; message: string } | null;

let rows: Row[] = [];
/** Every row handed to insert or upsert, in order, whether it was accepted. */
let writes: Row[] = [];
let deletes: number;
/** Faults to serve, one per write, shifted off as they are used. */
let faults: Fault[] = [];
let reachable = true;

function nextFault(): Fault {
  return faults.length > 0 ? (faults.shift() ?? null) : null;
}

function table() {
  const tests: ((row: Row) => boolean)[] = [];
  const builder = {
    eq(column: string, value: unknown) {
      tests.push((row) => row[column] === value);
      return builder;
    },
    neq(column: string, value: unknown) {
      tests.push((row) => row[column] !== value);
      return builder;
    },
    // A PostgrestFilterBuilder is a thenable, so awaiting one runs it.
    then(resolve: (result: { error: Fault }) => void) {
      deletes += 1;
      rows = rows.filter((row) => !tests.every((matches) => matches(row)));
      resolve({ error: null });
    }
  };
  return builder;
}

const client = {
  from() {
    return {
      insert(row: Row) {
        writes.push(row);
        if (!reachable) return Promise.resolve({ error: { message: 'Failed to fetch' } });
        const fault = nextFault();
        if (fault) return Promise.resolve({ error: fault });
        if (rows.some((held) => held.share_key === row.share_key)) {
          return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
        }
        rows.push(row);
        return Promise.resolve({ error: null });
      },
      upsert(row: Row) {
        writes.push(row);
        if (!reachable) return Promise.resolve({ error: { message: 'Failed to fetch' } });
        const fault = nextFault();
        if (fault) return Promise.resolve({ error: fault });
        const at = rows.findIndex((held) => held.share_key === row.share_key);
        if (at === -1) rows.push(row);
        else rows[at] = row;
        return Promise.resolve({ error: null });
      },
      delete: table
    };
  }
};

let authState: AuthState = { status: 'signed-in', email: 'host@example.com', userId: 'u1' };
const authListeners = new Set<() => void>();

function setAuth(next: AuthState) {
  authState = next;
  for (const listener of authListeners) listener();
}

vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  hasStoredSession: () => true,
  hasAuthCallback: () => false,
  getSupabase: () => Promise.resolve(client)
}));

vi.mock('./auth', () => ({
  initAuth: () => Promise.resolve(),
  authStore: {
    get: () => authState,
    subscribe(listener: () => void) {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    }
  }
}));

// Imported after the mocks are registered.
const { startSharing, stopSharing, startLive, liveStatusStore, __testing } =
  await import('./liveSession');
const stores = await import('./stores');
const { isShareKey } = await import('./shareKey');

// ---------------------------------------------------------------- a session --

function player(name: string, rating: number): Player {
  return { id: `id-${name}`, name, rating, gender: 'F', rosterIds: ['g1'] };
}

const roster = [player('Ava', 3.11), player('Ben', 3.22), player('Cara', 3.33), player('Dee', 3.44)];

function schedule(score?: { team1: number; team2: number }): Schedule {
  return {
    rounds: [
      {
        roundNumber: 1,
        courts: [
          {
            courtNumber: 1,
            team1: [roster[0], roster[1]],
            team2: [roster[2], roster[3]],
            ratingDiff: 0.55,
            ...(score ? { score } : {})
          }
        ],
        sitOuts: []
      }
    ]
  };
}

function seed() {
  stores.players.set(roster);
  stores.guests.set([]);
  stores.selectedIds.set(roster.map((p) => p.id));
  stores.removedIds.set([]);
  stores.completedRounds.set([]);
  stores.sessionId.set('sess-1');
  stores.scoringEnabled.set(true);
  stores.shareKey.set(null);
  stores.schedule.set(schedule());
}

const status = () => liveStatusStore.get();
const live = () => rows[0];

beforeEach(() => {
  vi.useFakeTimers();
  rows = [];
  writes = [];
  deletes = 0;
  faults = [];
  reachable = true;
  authState = { status: 'signed-in', email: 'host@example.com', userId: 'u1' };
  authListeners.clear();
  window.localStorage.clear();
  __testing.reset();
  seed();
});

afterEach(() => {
  __testing.reset();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('starting a share', () => {
  it('publishes the session and hands back a link', async () => {
    await startSharing();
    expect(rows).toHaveLength(1);
    const state = status();
    expect(state.state).toBe('live');
    if (state.state !== 'live') throw new Error('not live');
    expect(state.url).toContain('?s=');
    expect(isShareKey(state.url.split('?s=')[1])).toBe(true);
  });

  it('remembers the key, so a reload does not mint a second link', async () => {
    await startSharing();
    expect(stores.shareKey.get()).toBe(live().share_key);
  });

  it('never sends a user id', async () => {
    // The column defaults to auth.uid() and the policy verifies it. A client
    // that sends one can only ever be sending the wrong one.
    await startSharing();
    expect(writes[0]).not.toHaveProperty('user_id');
  });

  it('sends no ratings, which is the whole reason redaction exists', async () => {
    await startSharing();
    const sent = JSON.stringify(live().snapshot);
    for (const rating of ['3.11', '3.22', '3.33', '3.44', '0.55']) {
      expect(sent).not.toContain(rating);
    }
    // And the names are still there, so this is redaction rather than an
    // empty document that would pass the check above for the wrong reason.
    expect(sent).toContain('Ava');
  });

  it('carries everybody in the session, including whoever has gone home', async () => {
    stores.removedIds.set([roster[3].id]);
    await startSharing();
    const sent = JSON.stringify(live().snapshot);
    expect(sent).toContain('Dee');
  });

  it('clears out what this account had shared before', async () => {
    await startSharing();
    expect(deletes).toBe(1);
  });

  it('picks another name when the first is taken', async () => {
    rows.push({ share_key: 'TAKENTAKEN' } as Row);
    faults = [{ code: '23505', message: 'duplicate key' }];
    await startSharing();
    expect(status().state).toBe('live');
    expect(writes).toHaveLength(2);
    expect(writes[0].share_key).not.toBe(writes[1].share_key);
  });

  it('gives up rather than looping if every name is taken', async () => {
    faults = [
      { code: '23505', message: 'duplicate key' },
      { code: '23505', message: 'duplicate key' },
      { code: '23505', message: 'duplicate key' }
    ];
    await startSharing();
    expect(status().state).toBe('problem');
    expect(writes).toHaveLength(3);
  });

  it('refuses when there is no session to share', async () => {
    stores.schedule.set(null);
    await startSharing();
    expect(status()).toEqual({
      state: 'problem',
      url: null,
      message: 'There is no session to share yet.'
    });
    expect(rows).toHaveLength(0);
  });

  it('refuses when nobody is signed in', async () => {
    authState = { status: 'signed-out' };
    await startSharing();
    expect(status().state).toBe('problem');
    expect(rows).toHaveLength(0);
  });
});

describe('keeping it up to date', () => {
  it('publishes a score written after sharing started', async () => {
    await startSharing();
    stores.schedule.set(schedule({ team1: 11, team2: 7 }));
    await vi.advanceTimersByTimeAsync(1500);
    expect(JSON.stringify(live().snapshot)).toContain('"team1":11');
  });

  it('publishes a change that does not go through onUpdateSchedule', async () => {
    // A reshuffle, an added court, a substitution: nine of the thirteen ways a
    // schedule changes go nowhere near SchedulePage. Watching the store is what
    // catches them, and this is the test that says so.
    await startSharing();
    stores.completedRounds.set([1]);
    await vi.advanceTimersByTimeAsync(1500);
    expect((live().snapshot as { completedRounds: number[] }).completedRounds).toEqual([1]);
  });

  it('makes one upload out of a burst of edits', async () => {
    await startSharing();
    const before = writes.length;
    stores.schedule.set(schedule({ team1: 1, team2: 0 }));
    stores.schedule.set(schedule({ team1: 2, team2: 0 }));
    stores.schedule.set(schedule({ team1: 11, team2: 7 }));
    await vi.advanceTimersByTimeAsync(1500);
    expect(writes.length - before).toBe(1);
  });

  it('does not publish anything after Stop', async () => {
    await startSharing();
    await stopSharing();
    const before = writes.length;
    stores.schedule.set(schedule({ team1: 11, team2: 7 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(writes.length).toBe(before);
  });
});

describe('when the session ends', () => {
  it('takes the share down, wherever the ending came from', async () => {
    // Start New Session, a group switch, a deleted group and sync adopting an
    // account copy all null the schedule and none of them call this file. That
    // is the point of watching the store.
    await startSharing();
    stores.schedule.set(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(rows).toHaveLength(0);
    expect(stores.shareKey.get()).toBeNull();
    expect(status()).toEqual({ state: 'off' });
  });
});

describe('stopping', () => {
  it('deletes the published copy', async () => {
    await startSharing();
    await stopSharing();
    expect(rows).toHaveLength(0);
  });

  it('stops locally even when the request cannot be made', async () => {
    // A host who pressed Stop has stopped. The row expires within the day
    // regardless, and a switch that argues back is worse than a slow delete.
    await startSharing();
    reachable = false;
    await stopSharing();
    expect(status()).toEqual({ state: 'off' });
    expect(stores.shareKey.get()).toBeNull();
  });
});

describe('a reload part way through', () => {
  it('picks the share back up under the same key', async () => {
    await startSharing();
    const key = live().share_key;
    __testing.reset();

    startLive();
    await vi.advanceTimersByTimeAsync(0);
    const state = status();
    expect(state.state).toBe('live');
    if (state.state !== 'live') throw new Error('not live');
    expect(state.url).toContain(key);

    // And it is still watching.
    stores.schedule.set(schedule({ team1: 11, team2: 7 }));
    await vi.advanceTimersByTimeAsync(1500);
    expect(JSON.stringify(live().snapshot)).toContain('"team1":11');
  });

  it('drops a key whose session ended while the app was shut', async () => {
    stores.shareKey.set('ABCDEFGHJK');
    stores.schedule.set(null);
    startLive();
    await vi.advanceTimersByTimeAsync(0);
    expect(stores.shareKey.get()).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it('waits for sign-in rather than publishing into a refusal', async () => {
    await startSharing();
    __testing.reset();
    authState = { status: 'unknown' };

    startLive();
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toHaveLength(1); // only the insert from startSharing
    expect(status().state).toBe('publishing');

    setAuth({ status: 'signed-in', email: 'host@example.com', userId: 'u1' });
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toHaveLength(2);
    expect(status().state).toBe('live');
  });

  it('stops when the host signs out', async () => {
    await startSharing();
    __testing.reset();
    startLive();
    await vi.advanceTimersByTimeAsync(0);

    setAuth({ status: 'signed-out' });
    expect(status()).toEqual({ state: 'off' });
    expect(stores.shareKey.get()).toBeNull();
  });
});

describe('when the network is against it', () => {
  it('says so, and comes back on its own', async () => {
    await startSharing();
    reachable = false;
    stores.schedule.set(schedule({ team1: 11, team2: 7 }));
    await vi.advanceTimersByTimeAsync(1500);

    const problem = status();
    expect(problem.state).toBe('problem');
    if (problem.state !== 'problem') throw new Error('not a problem');
    expect(problem.message).toContain("You're offline");

    // Nothing else brings a failed publish back. A phone on one bar at a court
    // never fires `online`, because the connection is up and only the requests
    // are failing.
    reachable = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(status().state).toBe('live');
  });

  it('keeps the link on screen while it is failing', async () => {
    // The session is still shared and the QR on the table is still the right
    // one. Hiding the link because an upload failed would be a worse lie.
    await startSharing();
    reachable = false;
    stores.schedule.set(schedule({ team1: 11, team2: 7 }));
    await vi.advanceTimersByTimeAsync(1500);
    const problem = status();
    if (problem.state !== 'problem') throw new Error('not a problem');
    expect(problem.url).toContain('?s=');
  });
});
