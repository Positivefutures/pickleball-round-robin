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
 * New Round Robin shows a room a schedule nobody is playing.
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
    lt(column: string, value: unknown) {
      tests.push((row) => String(row[column]) < String(value));
      return builder;
    },
    // A PostgrestFilterBuilder is a thenable, so awaiting one runs it.
    then(resolve: (result: { error: Fault }) => void) {
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
const {
  startSharing, stopSharing, startLive, attachShare, detachShare, stopAllSharing,
  liveStatusStore, __testing
} = await import('./liveSession');
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
  // Set rather than left to its default, like every other line here: the store
  // caches, so a test that switches it off would hand the next one a host who
  // had already decided.
  stores.standingsShared.set(true);
  stores.shareKey.set(null);
  stores.schedule.set(schedule());
}

const status = () => liveStatusStore.get();
const live = () => rows[0];

beforeEach(() => {
  vi.useFakeTimers();
  rows = [];
  writes = [];
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
    // Without the timestamp. It is an ISO string, so a session published at
    // 23.113 seconds past the minute carries "3.11" in it, and this test would
    // fail perhaps once in a few hundred runs over something that has nothing
    // to do with a rating. Searching the serialised document is still the
    // point: a field somebody forgot is exactly what this is looking for.
    const sent = JSON.stringify({ ...(live().snapshot as object), at: '' });
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

  it("leaves another group's link alone when a new one is made", async () => {
    // The whole of this release in one assertion. This used to be a delete of
    // every other row the account held, on the grounds that a host runs one
    // session at a time. A host now runs three of tomorrow's afternoons at once.
    const future = new Date(Date.now() + 3600_000).toISOString();
    rows.push({ share_key: 'TUESDAYCRW', expires_at: future } as unknown as Row);

    await startSharing();

    expect(rows.some((row) => row.share_key === 'TUESDAYCRW')).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('sweeps its own expired rows on the way past, and leaves the living', async () => {
    // Nothing else in this schema deletes an expired row and cap_shared_sessions
    // counts them, so without this an account fills up over a year of
    // afternoons and can never share again. The blanket delete was doing this
    // job by accident, which is why nobody noticed it needed doing.
    const past = new Date(Date.now() - 3600_000).toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();
    rows.push({ share_key: 'DEADDEADAA', expires_at: past } as unknown as Row);
    rows.push({ share_key: 'ALIVEALIVE', expires_at: future } as unknown as Row);

    await startSharing();

    expect(rows.some((row) => row.share_key === 'DEADDEADAA')).toBe(false);
    expect(rows.some((row) => row.share_key === 'ALIVEALIVE')).toBe(true);
  });

  it('picks a held key back up rather than minting a group a second link', async () => {
    await startSharing();
    const first = live().share_key;
    // The Share card opened again, on a group that already has a link out —
    // which after an abandoned session is the ordinary case, not the odd one.
    __testing.reset();
    await startSharing();

    expect(__testing.key).toBe(first);
    expect(rows).toHaveLength(1);
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

  it('publishes the standings switch, and republishes when it moves', async () => {
    // The switch is only worth anything if it reaches the watchers. A host who
    // turned the standings off and was never republished would have taken them
    // off nobody's phone, which is the failure the WATCHED list exists to stop.
    await startSharing();
    expect((live().snapshot as { standingsShared: boolean }).standingsShared).toBe(true);

    stores.standingsShared.set(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect((live().snapshot as { standingsShared: boolean }).standingsShared).toBe(false);
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

describe('the round timer', () => {
  const timer = () => (live().snapshot as { roundTimer: unknown }).roundTimer;

  /** The store as the panel leaves it, for a round that is actually counting. */
  function running(endsAt: number) {
    stores.roundTimer.set({
      roundNumber: 1,
      phase: 'running',
      minutes: 12,
      endsAt,
      remainingMs: 720_000,
      soundOn: true,
      flashOn: true,
      alarmTone: 'bell'
    });
  }

  it('sends nothing while the host is still choosing a length', async () => {
    stores.roundTimer.set({
      roundNumber: 1,
      phase: 'idle',
      minutes: 12,
      endsAt: null,
      remainingMs: 720_000,
      soundOn: true,
      flashOn: true,
      alarmTone: 'bell'
    });
    await startSharing();
    expect(timer()).toBeNull();
  });

  it('publishes the deadline, and the alarm the host set for the court', async () => {
    await startSharing();
    const endsAt = Date.now() + 720_000;
    running(endsAt);
    await vi.advanceTimersByTimeAsync(1500);

    expect(timer()).toEqual({
      roundNumber: 1,
      phase: 'running',
      endsAt,
      remainingMs: 720_000,
      // All three of the host's alerts, because a watching phone starts on
      // them: the host is setting an alarm for a court, not only for the phone
      // in their hand. What each of those phones then does with it is theirs to
      // decide, and is decided on the phone. See lib/watchAlerts.ts.
      soundOn: true,
      flashOn: true,
      alarmTone: 'bell'
    });
  });

  it('leaves the setting that is nobody else’s business at home', async () => {
    await startSharing();
    running(Date.now() + 720_000);
    await vi.advanceTimersByTimeAsync(1500);

    // The configured length is the one thing on that panel that describes the
    // host's own screen rather than the court's afternoon. What the watchers
    // need from it is already in the deadline.
    expect(timer()).not.toHaveProperty('minutes');
  });

  it('takes the timer back off when it is reset', async () => {
    await startSharing();
    running(Date.now() + 720_000);
    await vi.advanceTimersByTimeAsync(1500);
    expect(timer()).not.toBeNull();

    stores.roundTimer.set((s) => ({ ...s, roundNumber: null, phase: 'idle', endsAt: null }));
    await vi.advanceTimersByTimeAsync(1500);

    expect(timer()).toBeNull();
  });

  it('does not upload the whole session for a tap on the minutes stepper', async () => {
    await startSharing();
    const before = writes.length;

    // Thumbing 12 up to 15 before starting anything. None of it is published,
    // so none of it is worth a round trip.
    for (const minutes of [13, 14, 15]) {
      stores.roundTimer.set((s) => ({ ...s, minutes, remainingMs: minutes * 60_000 }));
    }
    await vi.advanceTimersByTimeAsync(5000);

    expect(writes.length).toBe(before);
  });
});

describe('when the session ends', () => {
  it('leaves the link standing, whatever ended it', async () => {
    // New Round Robin, a walk back to Setup, a deleted group and sync adopting
    // an account copy all null the schedule and none of them call this file.
    // This used to be where the share came down, and it is not any more: a link
    // belongs to the group rather than to one afternoon, so the row keeps what
    // the watchers were last shown and the next Generate publishes over it.
    await startSharing();
    const key = live().share_key;
    const before = writes.length;

    stores.schedule.set(null);
    await vi.advanceTimersByTimeAsync(1500);

    expect(rows).toHaveLength(1);
    expect(stores.shareKey.get()).toBe(key);
    // And nothing new went up. There was nothing to send.
    expect(writes.length).toBe(before);
  });
});

describe('letting go of a group without taking its copy down', () => {
  it('leaves the row standing and hands the key back', async () => {
    await startSharing();
    const key = live().share_key;

    detachShare();
    await vi.advanceTimersByTimeAsync(0);

    expect(rows.some((row) => row.share_key === key)).toBe(true);
    expect(__testing.key).toBeNull();
    expect(status()).toEqual({ state: 'off' });
  });

  it('puts the last second and a half on the wire before it stops watching', async () => {
    await startSharing();
    const before = writes.length;

    // A score typed, and the host switches group before the debounce fires.
    // While a switch deleted the row this cost nothing. Now the row survives,
    // so the number would sit on nine other phones as a blank.
    stores.schedule.set(schedule({ team1: 11, team2: 9 }));
    detachShare();
    await vi.advanceTimersByTimeAsync(0);

    expect(writes.length).toBe(before + 1);
    expect(JSON.stringify(writes[writes.length - 1].snapshot)).toContain('"team1":11');
  });

  it('sends no clock on for a group nobody is running any more', async () => {
    await startSharing();
    stores.roundTimer.set((state) => ({
      ...state, roundNumber: 1, phase: 'running', endsAt: Date.now() + 600_000
    }));
    await vi.advanceTimersByTimeAsync(0);
    stores.schedule.set(schedule({ team1: 6, team2: 4 }));

    detachShare();
    await vi.advanceTimersByTimeAsync(0);

    const sent = writes[writes.length - 1].snapshot as { roundTimer: unknown };
    expect(sent.roundTimer).toBeNull();
  });

  it('picks a parked key back up and republishes under it', async () => {
    await startSharing();
    const key = live().share_key;
    detachShare();
    await vi.advanceTimersByTimeAsync(0);

    attachShare(key);
    stores.schedule.set(schedule({ team1: 3, team2: 8 }));
    await vi.advanceTimersByTimeAsync(1500);

    expect(live().share_key).toBe(key);
    expect(JSON.stringify(live().snapshot)).toContain('"team1":3');
  });

  it('takes every link down when an account copy is adopted', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    rows.push({ share_key: 'TUESDAYCRW', expires_at: future } as unknown as Row);
    await startSharing();

    await stopAllSharing();

    expect(rows).toHaveLength(0);
    expect(stores.shareKey.get()).toBeNull();
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

  it('leaves score editing and its code where the host put them', async () => {
    // This used to wipe both, so a host who allowed editing, stopped and
    // started again found the switch off and no way to tell that from the app
    // having lost it. Stopping is not handing the phone to somebody else.
    stores.scoreEditingAllowed.set(true);
    stores.scoreEditCode.set('4821');
    await startSharing();
    await stopSharing();

    expect(stores.scoreEditingAllowed.get()).toBe(true);
    expect(stores.scoreEditCode.get()).toBe('4821');

    // And the restarted share is still an editable one.
    await startSharing();
    expect(live().snapshot.scoreEditing).toBe(true);
  });

  it('still forgets them when the host signs out', async () => {
    // The one case that is genuinely somebody else holding the phone, and the
    // reason the wipe still exists at all.
    stores.scoreEditingAllowed.set(true);
    stores.scoreEditCode.set('4821');
    await startSharing();
    __testing.reset();
    startLive();
    await vi.advanceTimersByTimeAsync(0);

    setAuth({ status: 'signed-out' });

    expect(stores.scoreEditingAllowed.get()).toBe(false);
    expect(stores.scoreEditCode.get()).toBeNull();
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

  it('keeps a key whose session ended while the app was shut', async () => {
    // The link is the group's, not the afternoon's. A host who abandoned last
    // night's schedule and reopens the app to build today's has not asked
    // anybody to rescan anything, so the key waits for the next Generate.
    stores.shareKey.set('ABCDEFGHJK');
    stores.schedule.set(null);
    startLive();
    await vi.advanceTimersByTimeAsync(0);

    expect(stores.shareKey.get()).toBe('ABCDEFGHJK');
    // Held rather than published: there is still nothing to send.
    expect(writes).toHaveLength(0);

    // And the moment there is, it goes out under the same name.
    stores.schedule.set(schedule());
    await vi.advanceTimersByTimeAsync(1500);
    expect(live().share_key).toBe('ABCDEFGHJK');
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
