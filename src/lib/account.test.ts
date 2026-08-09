/**
 * @vitest-environment happy-dom
 *
 * Downloading everything an account holds, and ending it.
 *
 * The Supabase client is stood in for, because what matters here is which calls
 * are made and what is left behind afterwards. The deletion itself happens in
 * Postgres and is proved against the live database by `scripts/prove-delete.mjs`
 * instead; no mock can say whether a cascade fired.
 *
 * `./sync` is deliberately *not* mocked. Half the value of deleting an account
 * is that this device stops holding a queue of writes aimed at it, and a stub
 * would assert that a function was called rather than that the queue is empty.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ------------------------------------------------------------ the stand-ins --

type Row = Record<string, unknown>;

const server = {
  user: null as Row | null,
  userError: null as { message: string; status?: number } | null,
  profiles: [] as Row[],
  rosters: [] as Row[],
  players: [] as Row[],
  preferences: [] as Row[],
  readError: null as string | null,
  /** Every rpc the client was asked to make, name and arguments both. */
  rpcs: [] as { name: string; args: unknown }[],
  rpcError: null as { message: string; code?: string; status?: number } | null,
  /** What signOut was called with, which is the part worth pinning down. */
  signOuts: [] as unknown[],
  signOutThrows: false
};

const client = {
  auth: {
    getUser: () =>
      Promise.resolve({ data: { user: server.user }, error: server.userError }),
    signOut: (options?: unknown) => {
      server.signOuts.push(options);
      if (server.signOutThrows) return Promise.reject(new Error('Storage is full'));
      return Promise.resolve({ error: null });
    }
  },
  from(table: 'profiles' | 'rosters' | 'players' | 'preferences') {
    return {
      select: () =>
        Promise.resolve(
          server.readError
            ? { data: null, error: { message: server.readError } }
            : { data: server[table], error: null }
        )
    };
  },
  rpc(name: string, args?: unknown) {
    server.rpcs.push({ name, args });
    return Promise.resolve({ data: true, error: server.rpcError });
  }
};

vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  hasStoredSession: () => false,
  hasAuthCallback: () => false,
  getSupabase: () => Promise.resolve(client)
}));

const { buildMyDataFile, deleteMyAccount, toMyDataFileName } = await import('./account');
const { outbox } = await import('./outbox');
const { __testing } = await import('./sync');
const stores = await import('./stores');

// --------------------------------------------------------------------------

const ME = 'user-me';

function signedIn() {
  server.user = {
    id: ME,
    email: 'host@example.com',
    created_at: '2026-01-04T10:00:00.000Z',
    last_sign_in_at: '2026-08-09T09:00:00.000Z'
  };
}

/** Reads the file back the way somebody opening it in a text editor would. */
async function exported(now = new Date('2026-08-09T18:30:00.000Z')) {
  const result = await buildMyDataFile(now);
  if (!result.ok) throw new Error(`export failed: ${result.message}`);
  return {
    name: result.value.name,
    data: JSON.parse(result.value.json) as Record<string, unknown>
  };
}

beforeEach(() => {
  localStorage.clear();
  server.user = null;
  server.userError = null;
  server.profiles = [];
  server.rosters = [];
  server.players = [];
  server.preferences = [];
  server.readError = null;
  server.rpcs = [];
  server.rpcError = null;
  server.signOuts = [];
  server.signOutThrows = false;
  __testing.reset();
  outbox.set({});
});

// --------------------------------------------------------------------------

describe('toMyDataFileName', () => {
  it('stamps the day it was made, in local time', () => {
    // Local rather than ISO, so somebody in Vancouver pressing the button on
    // the evening of the 9th does not get a file named the 10th.
    const evening = new Date(2026, 7, 9, 22, 30);
    expect(toMyDataFileName(evening)).toBe('pickleball-my-data-2026-08-09.json');
  });

  it('pads a single-digit month and day', () => {
    expect(toMyDataFileName(new Date(2026, 0, 5))).toBe('pickleball-my-data-2026-01-05.json');
  });
});

describe('buildMyDataFile', () => {
  it('carries the account, every group, every player and the settings', async () => {
    signedIn();
    server.profiles = [{ user_id: ME, email: 'host@example.com', subscription_status: 'free' }];
    server.rosters = [{ user_id: ME, id: 'g1', name: 'Tuesday', deleted_at: null }];
    server.players = [
      { user_id: ME, id: 'p1', name: 'Ava', rating: 4, gender: 'F', roster_ids: ['g1'] }
    ];
    server.preferences = [{ user_id: ME, num_courts: 3, num_rounds: 8 }];

    const { data } = await exported();

    expect(data.account).toMatchObject({
      user_id: ME,
      email: 'host@example.com',
      created_at: '2026-01-04T10:00:00.000Z',
      last_sign_in_at: '2026-08-09T09:00:00.000Z'
    });
    expect((data.account as Row).profile).toMatchObject({ subscription_status: 'free' });
    expect(data.groups).toEqual(server.rosters);
    expect(data.players).toEqual(server.players);
    expect(data.settings).toEqual(server.preferences[0]);
    expect(data.exported_at).toBe('2026-08-09T18:30:00.000Z');
  });

  it('names the version it was exported from, so a stale file is spottable', async () => {
    signedIn();
    const { data } = await exported();
    const { APP_VERSION } = await import('./appInfo');
    expect(data.app_version).toBe(APP_VERSION);
  });

  it('explains itself in plain words, in the file', async () => {
    signedIn();
    const { data } = await exported();
    const readme = (data.readme as string[]).join('\n');
    // The three things somebody opening this file cannot work out on their own.
    expect(readme).toMatch(/groups.*rosters/i);
    expect(readme).toMatch(/deleted_at/);
    expect(readme).toMatch(/never left your device/i);
  });

  it('keeps deleted entries, because they are held', async () => {
    signedIn();
    server.rosters = [
      { id: 'g1', name: 'Tuesday', deleted_at: null },
      { id: 'g2', name: 'Old Thursday', deleted_at: '2026-05-01T00:00:00.000Z' }
    ];
    const { data } = await exported();
    expect(data.groups).toHaveLength(2);
  });

  it('holds up when the account has nothing in it', async () => {
    signedIn();
    const { data } = await exported();
    expect(data.groups).toEqual([]);
    expect(data.players).toEqual([]);
    expect(data.settings).toBeNull();
    expect((data.account as Row).profile).toBeNull();
  });

  it('is named after the day it was asked for', async () => {
    signedIn();
    const { name } = await exported(new Date(2026, 10, 30, 8, 0));
    expect(name).toBe('pickleball-my-data-2026-11-30.json');
  });

  it('reports a read that failed rather than writing half a file', async () => {
    signedIn();
    server.readError = 'Failed to fetch';
    const result = await buildMyDataFile();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/connection/i);
  });

  it('says so plainly when the session has stopped being good', async () => {
    server.userError = { message: 'invalid claim: missing sub claim', status: 401 };
    const result = await buildMyDataFile();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not signed in/i);
  });

  it('does not claim to export an account nobody is signed in to', async () => {
    server.user = null;
    const result = await buildMyDataFile();
    expect(result.ok).toBe(false);
  });
});

describe('deleteMyAccount', () => {
  it('asks the database to delete the caller, naming nobody', async () => {
    const result = await deleteMyAccount();
    expect(result.ok).toBe(true);
    expect(server.rpcs).toHaveLength(1);
    expect(server.rpcs[0].name).toBe('delete_my_account');
    // The whole security model. A user id in the arguments would be a user id
    // somebody could change.
    expect(server.rpcs[0].args).toBeUndefined();
  });

  it('ends the session in this browser only', async () => {
    await deleteMyAccount();
    // Not a global sign-out. The session row went with the account, so asking
    // the server to end it would fail for a reason that means nothing.
    expect(server.signOuts).toEqual([{ scope: 'local' }]);
  });

  it('leaves nothing behind that names the account', async () => {
    __testing.account.set(ME);
    __testing.mirror.set({ rosters: [{ id: 'g1', name: 'Tuesday' }], players: [] });
    __testing.cursorFor(ME).set('2026-08-01T00:00:00.000Z');
    outbox.set({
      'players:p1': { table: 'players', id: 'p1', row: { id: 'p1', name: 'Ava' } }
    });

    await deleteMyAccount();

    expect(__testing.account.get()).toBeNull();
    expect(__testing.mirror.get()).toBeNull();
    expect(outbox.get()).toEqual({});
    // The cursor key carries the user's id in its name, so an emptied value
    // would not be enough.
    expect(localStorage.getItem(`pb-sync-cursor:${ME}`)).toBeNull();
  });

  it('keeps every group and player on the device', async () => {
    stores.rosters.set([{ id: 'g1', name: 'Tuesday' }]);
    stores.players.set([
      { id: 'p1', name: 'Ava', rating: 4, gender: 'F', rosterIds: ['g1'] }
    ]);

    await deleteMyAccount();

    expect(stores.rosters.get()).toHaveLength(1);
    expect(stores.players.get()).toHaveLength(1);
  });

  it('reports the refusal, and changes nothing, when the database says no', async () => {
    __testing.account.set(ME);
    outbox.set({
      'players:p1': { table: 'players', id: 'p1', row: { id: 'p1', name: 'Ava' } }
    });
    server.rpcError = { message: 'Failed to fetch' };

    const result = await deleteMyAccount();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/connection/i);
    // Nothing was deleted, so nothing local should have been forgotten either.
    expect(__testing.account.get()).toBe(ME);
    expect(Object.keys(outbox.get())).toHaveLength(1);
    expect(server.signOuts).toHaveLength(0);
  });

  it('says a signed-out caller is signed out, not that something went wrong', async () => {
    server.rpcError = { message: 'Not signed in.', code: '42501', status: 403 };
    const result = await deleteMyAccount();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not signed in/i);
  });

  it('still reports success when the sign-out afterwards fails', async () => {
    // The account is already gone by then. Reporting a failure would send
    // somebody back to press the button again, be told they are not signed in,
    // and conclude their data is still sitting on a server.
    server.signOutThrows = true;
    const result = await deleteMyAccount();
    expect(result.ok).toBe(true);
    expect(__testing.account.get()).toBeNull();
  });
});
