/**
 * @vitest-environment happy-dom
 *
 * The branch taken on first sign-in, which is the only part of push-only sync
 * that can do real harm. Pushing is safe by construction — the server only
 * accumulates — but pushing into the *wrong account* is not, and neither is
 * seeding on top of data that was already there. Both are refusals here, and a
 * refusal that quietly stops refusing is exactly the regression worth pinning.
 *
 * The Supabase client and the auth store are both stood in for. What is being
 * tested is which calls get made and which do not, and a real client would only
 * make that harder to see.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthState } from './auth';

// ------------------------------------------------------------ the stand-ins --

interface FakeRow {
  id: string;
}

const server = {
  rosters: [] as FakeRow[],
  players: [] as FakeRow[],
  /** Every upsert that reached the client, in order. */
  pushed: [] as { table: string; rows: Record<string, unknown>[] }[],
  failPush: false,
};

const client = {
  from(table: 'rosters' | 'players' | 'preferences') {
    return {
      upsert(rows: Record<string, unknown>[]) {
        if (server.failPush) {
          return Promise.resolve({ error: { message: 'Failed to fetch' } });
        }
        server.pushed.push({ table, rows });
        return Promise.resolve({ error: null });
      },
      select() {
        return {
          limit() {
            const data = table === 'preferences' ? [] : server[table];
            return Promise.resolve({ data, error: null });
          },
        };
      },
    };
  },
};

let authState: AuthState = { status: 'signed-out' };
const authListeners = new Set<() => void>();

function signIn(userId: string) {
  authState = { status: 'signed-in', email: 'host@example.com', userId };
  for (const listener of authListeners) listener();
}

vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  hasStoredSession: () => true,
  hasAuthCallback: () => false,
  getSupabase: () => Promise.resolve(client),
}));

vi.mock('./auth', () => ({
  initAuth: () => Promise.resolve(),
  authStore: {
    get: () => authState,
    subscribe(listener: () => void) {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    },
  },
}));

// Imported after the mocks are registered.
const { startSync, syncStatusStore, __testing } = await import('./sync');
const { outbox, pendingCount } = await import('./outbox');
const stores = await import('./stores');

// --------------------------------------------------------------------------

const ME = 'user-me';
const SOMEONE_ELSE = 'user-else';

/** Runs the debounce timer and lets the pushes it starts settle. */
async function settle() {
  await vi.advanceTimersByTimeAsync(2000);
  await vi.advanceTimersByTimeAsync(2000);
}

function seedLocalData() {
  localStorage.setItem('pb-rosters', JSON.stringify([{ id: 'g1', name: 'Tuesday' }]));
  localStorage.setItem(
    'pb-roster',
    JSON.stringify([
      { id: 'p1', name: 'Ava', rating: 4, gender: 'F', rosterIds: ['g1'] },
      { id: 'p2', name: 'Ben', rating: 3.5, gender: 'M', rosterIds: ['g1'] },
    ])
  );
  localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
}

function rowsFor(table: string) {
  return server.pushed.filter((p) => p.table === table).flatMap((p) => p.rows);
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  authState = { status: 'signed-out' };
  authListeners.clear();
  server.rosters = [];
  server.players = [];
  server.pushed = [];
  server.failPush = false;
  __testing.reset();
  outbox.set({});
  seedLocalData();
});

afterEach(() => {
  vi.useRealTimers();
});

// --------------------------------------------------------------- the seed --

describe('first sign-in on a device that has never synced', () => {
  it('pushes everything up under the ids it already holds', async () => {
    startSync();
    signIn(ME);
    await settle();

    // Same ids on both sides is what stops the next sync creating duplicates.
    expect(rowsFor('rosters').map((r) => r.id)).toEqual(['g1']);
    expect(rowsFor('players').map((r) => r.id)).toEqual(['p1', 'p2']);
    expect(rowsFor('preferences')[0].active_roster_id).toBe('g1');

    expect(__testing.account.get()).toBe(ME);
    expect(pendingCount()).toBe(0);
    expect(syncStatusStore.get()).toEqual({ state: 'saved' });
  });

  it('claims the device even if the push fails, so a retry is not mistaken for a merge', async () => {
    server.failPush = true;
    startSync();
    signIn(ME);
    await settle();

    // The decision "this cache belongs to this account" was settled by finding
    // the account empty. Waiting for the push to succeed would mean a failed
    // seed left half its rows on the server and the device unclaimed — and the
    // next launch would see data it did not recognise and refuse to sync.
    expect(__testing.account.get()).toBe(ME);
    expect(pendingCount()).toBeGreaterThan(0);
    expect(syncStatusStore.get().state).toBe('waiting');
  });
});

// ----------------------------------------------------------- the refusals --

describe('what it refuses to do', () => {
  it('pushes nothing when the account already has groups on it', async () => {
    server.rosters = [{ id: 'existing' }];

    startSync();
    signIn(ME);
    await settle();

    expect(server.pushed).toEqual([]);
    expect(__testing.account.get()).toBeNull();
    expect(syncStatusStore.get()).toEqual({ state: 'blocked', reason: 'server-has-data' });
  });

  it('pushes nothing when this device belongs to a different account', async () => {
    __testing.account.set(SOMEONE_ELSE);

    startSync();
    signIn(ME);
    await settle();

    // The one unrecoverable mistake available here is uploading one person's
    // groups into another person's account.
    expect(server.pushed).toEqual([]);
    expect(__testing.account.get()).toBe(SOMEONE_ELSE);
    expect(syncStatusStore.get()).toEqual({ state: 'blocked', reason: 'other-account' });
  });

  it('sends nothing at all before anyone signs in', async () => {
    startSync();
    await settle();
    stores.players.set((prev) => [...prev, { id: 'p3', name: 'Cara', rating: 4, gender: 'F', rosterIds: ['g1'] }]);
    await settle();

    expect(server.pushed).toEqual([]);
    expect(syncStatusStore.get()).toEqual({ state: 'off' });
  });
});

// ------------------------------------------------------- ongoing tracking --

describe('once it is running', () => {
  async function signedInAndSeeded() {
    startSync();
    signIn(ME);
    await settle();
    server.pushed = [];
  }

  it('pushes an edit, and only the row that changed', async () => {
    await signedInAndSeeded();

    stores.players.set((prev) => prev.map((p) => (p.id === 'p1' ? { ...p, rating: 4.75 } : p)));
    await settle();

    expect(rowsFor('players')).toEqual([
      expect.objectContaining({ id: 'p1', rating: 4.75, deleted_at: null }),
    ]);
  });

  it('pushes a delete as a tombstone rather than dropping the row', async () => {
    await signedInAndSeeded();

    stores.players.set((prev) => prev.filter((p) => p.id !== 'p2'));
    await settle();

    const [row] = rowsFor('players');
    expect(row.id).toBe('p2');
    expect(row.deleted_at).toEqual(expect.any(String));
  });

  it('coalesces a burst of edits into one row on the wire', async () => {
    await signedInAndSeeded();

    for (const name of ['A', 'Av', 'Ava B']) {
      stores.players.set((prev) => prev.map((p) => (p.id === 'p1' ? { ...p, name } : p)));
    }
    await settle();

    expect(rowsFor('players')).toEqual([expect.objectContaining({ name: 'Ava B' })]);
  });

  it('rolls a preference change into the single preferences row', async () => {
    await signedInAndSeeded();

    stores.numCourts.set(5);
    stores.largeText.set(true);
    await settle();

    expect(rowsFor('preferences')).toHaveLength(1);
    expect(rowsFor('preferences')[0]).toMatchObject({ num_courts: 5, large_text: true });
  });

  it('leaves the schedule alone, because a live session belongs to the device', async () => {
    await signedInAndSeeded();

    stores.completedRounds.set([1, 2]);
    stores.selectedIds.set(['p1']);
    await settle();

    expect(server.pushed).toEqual([]);
  });

  it('keeps a failed push queued, and sends it when the network comes back', async () => {
    await signedInAndSeeded();

    server.failPush = true;
    stores.players.set((prev) => prev.map((p) => (p.id === 'p1' ? { ...p, rating: 5 } : p)));
    await settle();

    expect(pendingCount()).toBe(1);
    expect(syncStatusStore.get()).toMatchObject({ state: 'waiting', pending: 1 });

    server.failPush = false;
    window.dispatchEvent(new Event('online'));
    await settle();

    expect(rowsFor('players')).toEqual([expect.objectContaining({ id: 'p1', rating: 5 })]);
    expect(pendingCount()).toBe(0);
  });
});
