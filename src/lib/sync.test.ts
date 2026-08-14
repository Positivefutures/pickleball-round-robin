/**
 * @vitest-environment happy-dom
 *
 * What the engine does with an account, and more importantly what it refuses to
 * do without being asked.
 *
 * Two properties are worth pinning above all others. A pull must never discard
 * an edit the user has made and not yet sent, and neither branch of the merge
 * may run without an answer — combining silently would fold two people's data
 * together, replacing silently would throw one of them away. Both are refusals,
 * and a refusal that quietly stops refusing is exactly the regression that
 * would cost somebody their groups.
 *
 * The Supabase client and the auth store are both stood in for. What is being
 * tested is which calls get made and which do not, and a real client would only
 * make that harder to see.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthState } from './auth';
import type { Player } from '../types';
import { buildExamplePlayers } from './exampleGroup';

// ------------------------------------------------------------ the stand-ins --

type FakeRow = Record<string, unknown> & { id?: string };

/** Server timestamps that increase, so cursor assertions can be exact. */
let clock = 0;
function tick(): string {
  clock += 1;
  return `2026-03-01T00:00:${String(clock).padStart(2, '0')}.000Z`;
}

const server = {
  rosters: [] as FakeRow[],
  players: [] as FakeRow[],
  preferences: [] as FakeRow[],
  /** Every upsert that reached the client, in order. */
  pushed: [] as { table: string; rows: FakeRow[] }[],
  /** true for a dead network, or a string to choose what the server said. */
  failPush: false as boolean | string,
  /** Makes reads fail, the way a dead spot would. */
  failRead: null as string | null
};

/** How many reads have been asked for, for the backoff test. */
let reads = 0;

/**
 * How many upserts were attempted, refused ones included. server.pushed only
 * records the ones that landed, so it cannot see a retry that failed, which is
 * the whole subject of the push retry tests below.
 */
let upserts = 0;

type Table = 'rosters' | 'players' | 'preferences';

/**
 * A PostgREST builder is awaitable and chainable at the same time. The thenable
 * below is the smallest thing that behaves like one.
 */
function builder(table: Table, keep: (row: FakeRow) => boolean) {
  const run = () => {
    reads += 1;
    if (server.failRead) {
      return Promise.resolve({
        data: null,
        error: { message: server.failRead }
      });
    }
    return Promise.resolve({ data: server[table].filter(keep), error: null });
  };

  return {
    gte(column: string, value: string) {
      return builder(table, (row) => keep(row) && String(row[column]) >= value);
    },
    then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
      return run().then(onOk, onErr);
    }
  };
}

const client = {
  from(table: Table) {
    return {
      upsert(rows: FakeRow[]) {
        upserts += 1;
        if (server.failPush) {
          return Promise.resolve({
            error: {
              message:
                typeof server.failPush === 'string' ? server.failPush : 'Failed to fetch'
            }
          });
        }
        server.pushed.push({ table, rows });
        // Land them, so a pull straight afterwards sees what was written.
        for (const row of rows) {
          const stamped = { ...row, server_updated_at: tick() };
          if (table === 'preferences') {
            server.preferences = [stamped];
            continue;
          }
          const at = server[table].findIndex((existing) => existing.id === row.id);
          if (at === -1) server[table].push(stamped);
          else server[table][at] = stamped;
        }
        return Promise.resolve({ error: null });
      },
      select() {
        return builder(table, () => true);
      }
    };
  }
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
const { startSync, syncStatusStore, combineWithAccount, adoptAccountCopy, __testing } =
  await import('./sync');
const { outbox, pendingCount, playerRow, entryKey } = await import('./outbox');
const stores = await import('./stores');

// --------------------------------------------------------------------------

const ME = 'user-me';
const SOMEONE_ELSE = 'user-else';

/** Runs the debounce timer and lets the pushes and pulls it starts settle. */
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
      { id: 'p2', name: 'Ben', rating: 3.5, gender: 'M', rosterIds: ['g1'] }
    ])
  );
  localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
}

/** Marks this device as already belonging to ME, the way a previous run would. */
function alreadySynced() {
  __testing.account.set(ME);
  __testing.mirror.set({
    rosters: stores.rosters.get(),
    players: stores.players.get()
  });
}

function serverRoster(id: string, name: string, deleted: string | null = null): FakeRow {
  const at = tick();
  return {
    id,
    name,
    deleted_at: deleted,
    updated_at: at,
    server_updated_at: at
  };
}

function serverPlayer(
  id: string,
  name: string,
  rosterIds: string[],
  extra: Partial<{
    rating: number;
    gender: string;
    deleted_at: string | null;
  }> = {}
): FakeRow {
  const at = tick();
  return {
    id,
    name,
    rating: 4,
    gender: 'F',
    roster_ids: rosterIds,
    deleted_at: null,
    updated_at: at,
    server_updated_at: at,
    ...extra
  };
}

function rowsFor(table: string) {
  return server.pushed.filter((p) => p.table === table).flatMap((p) => p.rows);
}

function names(players: Player[]) {
  return players.map((p) => p.name);
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  clock = 0;
  reads = 0;
  upserts = 0;
  authState = { status: 'signed-out' };
  authListeners.clear();
  server.rosters = [];
  server.players = [];
  server.preferences = [];
  server.pushed = [];
  server.failPush = false;
  server.failRead = null;
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

// ------------------------------------- a start that could not get started --

describe('when the first sign-in cannot reach the server', () => {
  it('does not sit there claiming to be trying, and actually retries', async () => {
    // Reported from a phone on 2026-08-08: the panel read "0 changes still to
    // save. Couldn't reach your account just now. This will try again." It
    // never did. onSignedIn returns early once userId is set, so one bad
    // moment of signal meant nothing was ever saved for the rest of the
    // session, while the panel said otherwise.
    server.failRead = 'Failed to fetch';

    startSync();
    signIn(ME);
    await settle();

    // Not "waiting", which would report a count of zero and read as if
    // everything were saved.
    expect(syncStatusStore.get().state).toBe('unready');
    expect(__testing.account.get()).toBeNull();
    expect(server.pushed).toEqual([]);

    // The dead spot ends.
    server.failRead = null;
    await vi.advanceTimersByTimeAsync(20_000);
    await settle();

    expect(__testing.account.get()).toBe(ME);
    expect(rowsFor('players').map((r) => r.id)).toEqual(['p1', 'p2']);
    expect(syncStatusStore.get()).toEqual({ state: 'saved' });
  });

  it('picks the retry up straight away when the network comes back', async () => {
    server.failRead = 'Failed to fetch';
    startSync();
    signIn(ME);
    await settle();
    expect(syncStatusStore.get().state).toBe('unready');

    server.failRead = null;
    window.dispatchEvent(new Event('online'));
    await settle();

    expect(syncStatusStore.get()).toEqual({ state: 'saved' });
  });

  it('carries the underlying message, since nobody can read a console on a phone', async () => {
    server.failRead = 'JWT expired';
    startSync();
    signIn(ME);
    await settle();

    const status = syncStatusStore.get();
    expect(status).toMatchObject({ state: 'unready', detail: 'JWT expired' });
  });

  it('backs off rather than hammering a phone with no signal', async () => {
    server.failRead = 'Failed to fetch';
    startSync();
    signIn(ME);
    await settle();

    const before = reads;
    // Four minutes of no signal should be a handful of tries, not hundreds. A
    // phone in a dead spot retrying in a tight loop is a flat battery.
    await vi.advanceTimersByTimeAsync(4 * 60_000);

    expect(reads - before).toBeLessThan(30);
    expect(reads - before).toBeGreaterThan(0);
  });

  it('drops a pending retry when somebody else signs in on the device', async () => {
    server.failRead = 'Failed to fetch';
    startSync();
    signIn(ME);
    await settle();

    // The other person's sign-in succeeds and claims this never-synced device.
    server.failRead = null;
    signIn(SOMEONE_ELSE);
    await settle();
    expect(__testing.account.get()).toBe(SOMEONE_ELSE);

    // ME's retry now falls due. It must not fire against the new session.
    const pushesBefore = server.pushed.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(server.pushed.length).toBe(pushesBefore);
    expect(__testing.account.get()).toBe(SOMEONE_ELSE);
  });
});

// ----------------------------------------------------------- the questions --

describe('what it will not decide on its own', () => {
  it('asks rather than merging when the account already has groups', async () => {
    server.rosters = [serverRoster('sg', 'Thursday')];
    server.players = [serverPlayer('sp', 'Ava', ['sg']), serverPlayer('sp2', 'Cal', ['sg'])];

    startSync();
    signIn(ME);
    await settle();

    expect(server.pushed).toEqual([]);
    expect(__testing.account.get()).toBeNull();
    expect(syncStatusStore.get()).toEqual({
      state: 'choice',
      reason: 'server-has-data',
      account: { rosters: 1, players: 2 },
      device: { rosters: 1, players: 2 },
      // Named up front, so nobody folds two different people together without
      // having been shown it.
      matched: ['Ava']
    });
  });

  it('asks before letting one person data into another person account', async () => {
    // The account is empty, so seeding would look harmless. It is not: the rows
    // on this device belong to whoever was signed in before.
    __testing.account.set(SOMEONE_ELSE);

    startSync();
    signIn(ME);
    await settle();

    expect(server.pushed).toEqual([]);
    expect(__testing.account.get()).toBe(SOMEONE_ELSE);
    expect(syncStatusStore.get()).toMatchObject({
      state: 'choice',
      reason: 'other-account',
      account: { rosters: 0, players: 0 }
    });
  });

  it('sends nothing at all before anyone signs in', async () => {
    startSync();
    await settle();
    stores.players.set((prev) => [
      ...prev,
      { id: 'p3', name: 'Cara', rating: 4, gender: 'F', rosterIds: ['g1'] }
    ]);
    await settle();

    expect(server.pushed).toEqual([]);
    expect(syncStatusStore.get()).toEqual({ state: 'off' });
  });
});

/**
 * The question can outlive the moment it was asked.
 *
 * It is raised by startSync at the app's first render rather than by opening My
 * Account, and an unanswered one survives a relaunch, because `pb-sync-account`
 * is only written once combining or adopting has actually run. So the app stays
 * fully usable while it waits, and somebody can spend a whole session at a court
 * adding people before they ever look at the screen holding the question.
 *
 * combineWithAccount re-reads the live stores when it runs, and has to: it
 * writes the plan back over them, so planning from a frozen copy would delete
 * whatever arrived in between. That leaves one rule for the question itself,
 * which is that it has to be re-read too. A screen naming one duplicate while
 * the merge folds two is consent for something that did not happen, and naming
 * them is the only protection this design has against two different people with
 * the same name quietly becoming one.
 */
describe('a question left unanswered while the app carries on', () => {
  async function askedAndLeft() {
    server.rosters = [serverRoster('sg', 'Thursday')];
    server.players = [serverPlayer('sp', 'Ava', ['sg']), serverPlayer('sp2', 'Cal', ['sg'])];

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get()).toMatchObject({
      state: 'choice',
      device: { rosters: 1, players: 2 },
      matched: ['Ava']
    });
  }

  it('counts what is on the device now, not what was on it when it asked', async () => {
    await askedAndLeft();

    stores.rosters.set((prev) => [...prev, { id: 'g2', name: 'Sunday' }]);
    stores.players.set((prev) => [
      ...prev,
      { id: 'p3', name: 'Dana', rating: 4, gender: 'F', rosterIds: ['g2'] }
    ]);

    expect(syncStatusStore.get()).toMatchObject({
      state: 'choice',
      // The account side is frozen on purpose. It is the snapshot the merge
      // will use, so freezing it is what keeps the screen and the merge agreed.
      account: { rosters: 1, players: 2 },
      device: { rosters: 2, players: 3 }
    });
  });

  it('names a duplicate that arrived after it asked, because folding it is the answer', async () => {
    await askedAndLeft();

    // Cal is already on the account. Adding him here makes him a duplicate the
    // first wording of the question had no way to know about.
    stores.players.set((prev) => [
      ...prev,
      { id: 'p3', name: 'Cal', rating: 4, gender: 'M', rosterIds: ['g1'] }
    ]);

    expect(syncStatusStore.get()).toMatchObject({ matched: ['Ava', 'Cal'] });

    // And what it last said is what it goes on to do.
    const report = await combineWithAccount();
    expect(report.details.join(' ')).toContain('Ava, Cal');
  });

  it('merges what arrived late rather than dropping it', async () => {
    await askedAndLeft();

    stores.rosters.set((prev) => [...prev, { id: 'g2', name: 'Sunday' }]);
    await combineWithAccount();
    await settle();

    // Guards the fix from the other direction. Freezing the device side of the
    // question would keep the screen honest by throwing this group away.
    expect(
      stores.rosters
        .get()
        .map((r) => r.name)
        .sort()
    ).toEqual(['Sunday', 'Thursday', 'Tuesday']);
    expect(rowsFor('rosters').map((r) => r.name)).toContain('Sunday');
  });
});

// ------------------------------------------------- the question not asked --

/**
 * The one case where the merge question is skipped, and why skipping it is not
 * the same as the silent branches above.
 *
 * A fresh install opens on the example group and its sample players. Somebody
 * signing in on it, who already has groups on their account, was being asked
 * whether to combine the two or replace one — a warning about their own data,
 * about two dozen players they never made, with one sensible answer. The
 * example is taken away with the same move that brings their groups down.
 *
 * Every test below that still expects 'choice' is the important half. The guard
 * has to be narrow, or it becomes a silent replace, which is the exact thing the
 * rest of this file exists to prevent.
 */
describe('signing in on a device still holding only the example group', () => {
  function seededPlayers() {
    let n = 0;
    return buildExamplePlayers('g1', () => `ex${n++}`);
  }

  /** Puts the device in the state a fresh install leaves it in. */
  function fresh(players = seededPlayers(), rosters = [{ id: 'g1', name: 'Sample Group' }]) {
    // Set rather than seeded through storage: these stores are module-level and
    // a live subscription from an earlier test keeps their cache.
    stores.rosters.set(rosters);
    stores.players.set(players);
    stores.activeRosterId.set(rosters[0].id);
    stores.exampleMeta.set({ rosterId: 'g1', playerIds: seededPlayers().map((p) => p.id) });
    outbox.set({});
  }

  function accountHasGroups() {
    server.rosters = [serverRoster('sg', 'Thursday')];
    server.players = [serverPlayer('sp', 'Ava', ['sg'])];
  }

  it('takes the account copy without asking, and the example goes with it', async () => {
    fresh();
    accountHasGroups();

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).not.toBe('choice');
    expect(stores.rosters.get().map((r) => r.name)).toEqual(['Thursday']);
    expect(names(stores.players.get())).toEqual(['Ava']);
    // The whole point: no sample crowd left behind next to their real groups.
    expect(stores.rosters.get().map((r) => r.name)).not.toContain('Sample Group');
    expect(stores.activeRosterId.get()).toBe('sg');
    // The seed record goes with it, so this branch can never match again.
    expect(stores.exampleMeta.get()).toBeNull();
  });

  it('claims the device, so the next edit is saved rather than asked about', async () => {
    fresh();
    accountHasGroups();
    startSync();
    signIn(ME);
    await settle();
    server.pushed = [];

    stores.rosters.set((prev) => [...prev, { id: 'g9', name: 'Sunday' }]);
    await settle();

    expect(rowsFor('rosters').map((r) => r.name)).toContain('Sunday');
  });

  it('takes it silently even after sample players were deleted', async () => {
    // Fewer sample players than the seed wrote is still nothing anybody made.
    fresh(seededPlayers().slice(4));
    accountHasGroups();

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).not.toBe('choice');
  });

  it('still asks when somebody typed a player in, which is a host who has started', async () => {
    fresh([
      ...seededPlayers(),
      { id: 'p9', name: 'Jeff B', rating: 4, gender: 'M', rosterIds: ['g1'] }
    ]);
    accountHasGroups();

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).toBe('choice');
  });

  it('still asks when the group has been renamed', async () => {
    // Renaming it is the smallest sign somebody means to use it, and the name
    // is part of what separates the seed's group from one meant on purpose.
    fresh(seededPlayers(), [{ id: 'g1', name: 'Tuesday' }]);
    accountHasGroups();

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).toBe('choice');
  });

  it('takes it silently on a device seeded under the old name', async () => {
    // It was called Example Group before the rename. A device seeded then and
    // signing in now holds exactly what the seed wrote, and must not be asked.
    fresh(seededPlayers(), [{ id: 'g1', name: 'Example Group' }]);
    accountHasGroups();

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).not.toBe('choice');
    expect(stores.rosters.get().map((r) => r.name)).toEqual(['Thursday']);
  });

  it('still asks when there is a second group', async () => {
    fresh(seededPlayers(), [
      { id: 'g1', name: 'Sample Group' },
      { id: 'g2', name: 'Sunday' }
    ]);
    accountHasGroups();

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).toBe('choice');
  });

  it('still asks on an install with no seed record, example-looking or not', async () => {
    // An updated install never had the seed. Whatever it holds, somebody put
    // it there.
    fresh();
    stores.exampleMeta.set(null);
    accountHasGroups();

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).toBe('choice');
  });

  it('still adopts a never-used install from before the example existed', async () => {
    // The old starter group, empty and never renamed, is the same provable
    // nothing it always was.
    stores.rosters.set([{ id: 'g1', name: 'My First Group' }]);
    stores.players.set([]);
    stores.activeRosterId.set('g1');
    stores.exampleMeta.set(null);
    outbox.set({});
    accountHasGroups();

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).not.toBe('choice');
    expect(stores.rosters.get().map((r) => r.name)).toEqual(['Thursday']);
  });

  it('still seeds a first sign-in up when the account is empty, rather than adopting nothing', async () => {
    // The example is this person's only group and there is nothing to replace
    // it with. Taking the account copy here would hand them an empty account
    // and quietly drop the group the app opens on.
    fresh();
    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).not.toBe('choice');
    expect(stores.rosters.get().map((r) => r.name)).toEqual(['Sample Group']);
    expect(rowsFor('rosters').map((r) => r.name)).toContain('Sample Group');
    expect(rowsFor('players')).toHaveLength(24);
  });

  it('does not ask a device that was signed into somebody else, having nothing of theirs', async () => {
    // The other-account warning protects data this device is holding for the
    // previous person. A crowd of sample players is not that.
    fresh();
    __testing.account.set(SOMEONE_ELSE);
    accountHasGroups();

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).not.toBe('choice');
    expect(stores.rosters.get().map((r) => r.name)).toEqual(['Thursday']);
  });

  it('hands over a plain empty group when the account holds nothing and the example must go', async () => {
    // Signed into somebody else before, meeting an empty account. The example
    // is replaced, and what replaces it is a plain group — this person has an
    // account, they are past needing samples.
    fresh();
    __testing.account.set(SOMEONE_ELSE);

    startSync();
    signIn(ME);
    await settle();

    expect(syncStatusStore.get().state).not.toBe('choice');
    expect(stores.rosters.get()).toEqual([{ id: 'default', name: 'My Group' }]);
    expect(stores.players.get()).toEqual([]);
    expect(stores.exampleMeta.get()).toBeNull();
  });
});

// -------------------------------------------------------------- the merge --

describe('combining this device with the account', () => {
  async function asked() {
    server.rosters = [serverRoster('sg', 'tuesday'), serverRoster('sg2', 'Thursday')];
    // The account has Ava in Thursday. This device has her in Tuesday. One
    // person, two groups, and being in a group is not an opinion two devices
    // can hold differently.
    server.players = [serverPlayer('sp', 'ava', ['sg2'], { rating: 4.5 })];
    startSync();
    signIn(ME);
    await settle();
    expect(syncStatusStore.get().state).toBe('choice');
    server.pushed = [];
  }

  it('adopts the account ids, so merging cannot make two of everything', async () => {
    await asked();
    await combineWithAccount();
    await settle();

    // The local group was called Tuesday and the account calls it tuesday.
    // One group, under the account's id.
    expect(stores.rosters.get().map((r) => r.id)).toEqual(['sg', 'sg2']);
    expect(names(stores.players.get()).sort()).toEqual(['Ben', 'ava']);
    // The account keeps its own rating, exactly as a file import does, and
    // ends up in both groups rather than one side's.
    expect(stores.players.get().find((p) => p.id === 'sp')?.rating).toBe(4.5);
    expect(stores.players.get().find((p) => p.id === 'sp')?.rosterIds).toEqual(['sg2', 'sg']);
    // Ava's local id is gone, so nothing refers to her twice.
    expect(stores.players.get().some((p) => p.id === 'p1')).toBe(false);

    expect(__testing.account.get()).toBe(ME);
    expect(syncStatusStore.get().state).toBe('saved');
  });

  it('sends up only what the account was missing', async () => {
    await asked();
    await combineWithAccount();
    await settle();

    // Ben is new to the account. Ava is not, but she has joined a group the
    // account did not have her in, so her row has to go up too.
    expect(rowsFor('rosters')).toEqual([]);
    expect(
      rowsFor('players')
        .map((r) => r.id)
        .sort()
    ).toEqual(['p2', 'sp']);
  });

  it('follows the adopted ids into a session that is already under way', async () => {
    stores.selectedIds.set(['p1', 'p2']);
    stores.partnerships.set([{ player1Id: 'p1', player2Id: 'p2' }]);
    await asked();
    await combineWithAccount();

    // p1 became sp. A session still naming p1 would draw fine and quietly stop
    // applying the partnership, which is the worst kind of broken.
    expect(stores.selectedIds.get()).toEqual(['sp', 'p2']);
    expect(stores.partnerships.get()).toEqual([{ player1Id: 'sp', player2Id: 'p2' }]);
  });

  it('reports what it did, in the words the import summaries use', async () => {
    await asked();
    const report = await combineWithAccount();

    expect(report.title).toBe('Combined.');
    expect(report.details.join(' ')).toContain('2 groups and 2 players');
    expect(report.details.join(' ')).toContain('ava');
  });
});

describe('taking the account copy instead', () => {
  it('replaces what is on the device and clears the session it belonged to', async () => {
    server.rosters = [serverRoster('sg', 'Thursday')];
    server.players = [serverPlayer('sp', 'Cal', ['sg'])];
    stores.schedule.set({ rounds: [] });
    stores.selectedIds.set(['p1']);

    startSync();
    signIn(ME);
    await settle();
    server.pushed = [];

    await adoptAccountCopy();
    await settle();

    expect(stores.rosters.get()).toEqual([{ id: 'sg', name: 'Thursday' }]);
    expect(names(stores.players.get())).toEqual(['Cal']);
    expect(stores.activeRosterId.get()).toBe('sg');
    // Every id that session referred to has gone.
    expect(stores.schedule.get()).toBeNull();
    expect(stores.selectedIds.get()).toEqual([]);
    expect(__testing.account.get()).toBe(ME);
  });

  it('does not carry the previous account queued rows into this one', async () => {
    // The most damaging thing available here: rows belonging to whoever was
    // signed in before, sitting unsent, pushed into somebody else's account.
    __testing.account.set(SOMEONE_ELSE);
    outbox.set({
      'players:p1': {
        table: 'players',
        id: 'p1',
        row: playerRow(
          { id: 'p1', name: 'Ava', rating: 4, gender: 'F', rosterIds: ['g1'] },
          '2026-01-01T00:00:00.000Z'
        )
      }
    });

    startSync();
    signIn(ME);
    await settle();
    expect(syncStatusStore.get().state).toBe('choice');

    await adoptAccountCopy();
    await settle();

    expect(rowsFor('players')).toEqual([]);
    expect(pendingCount()).toBe(0);
  });
});

// --------------------------------------------------------------- the pull --

describe('reading the account back', () => {
  it('brings down a group and a player added on another device', async () => {
    alreadySynced();
    server.rosters = [serverRoster('g1', 'Tuesday'), serverRoster('g2', 'Sunday')];
    server.players = [serverPlayer('p9', 'Cal', ['g2'])];

    startSync();
    signIn(ME);
    await settle();

    expect(stores.rosters.get().map((r) => r.name)).toEqual(['Tuesday', 'Sunday']);
    expect(names(stores.players.get())).toEqual(['Ava', 'Ben', 'Cal']);
  });

  /**
   * The swap hint is a latch, alone in a row that is otherwise last-write-wins.
   * A device that changed a preference while its own copy of the flag still said
   * false would otherwise carry that false to a phone where the banner had been
   * closed, and reopen it — which is the complaint the column exists to end. The
   * person's preferences in the row still have to land.
   */
  it('never lets another device reopen a swap hint this one has closed', async () => {
    alreadySynced();
    stores.swapHintDismissed.set(true);
    // That set may have queued a push, and an unsent preferences row is a
    // deliberate reason not to apply a pulled one. This is a pull test.
    outbox.set({});
    const at = tick();
    server.preferences = [
      {
        user_id: ME,
        default_rating: 3.25,
        swap_hint_dismissed: false,
        updated_at: at,
        server_updated_at: at
      }
    ];

    startSync();
    signIn(ME);
    await settle();

    expect(stores.defaultRating.get()).toBe(3.25);
    expect(stores.swapHintDismissed.get()).toBe(true);
  });

  /**
   * Courts, rounds, round types and the scoreboard describe the group in front
   * of the host now, not the host. The row carries whichever group happened to
   * be open on the device that sent it, so a phone sitting on a four-court club
   * night must not reset the two courts this one is playing on.
   */
  it('leaves this group\'s courts alone when another device pulls in', async () => {
    alreadySynced();
    stores.numCourts.set(2);
    outbox.set({});
    const at = tick();
    server.preferences = [
      { user_id: ME, num_courts: 7, updated_at: at, server_updated_at: at }
    ];

    startSync();
    signIn(ME);
    await settle();

    expect(stores.numCourts.get()).toBe(2);
  });

  /**
   * The other device's choice of group arrives here as a preference, and it is
   * the one path that can change groups without anybody tapping anything. It has
   * to go through the same door the pickers use: the live session stores are
   * read everywhere as the active group's, so moving the id on its own would
   * leave this device showing one group's name over another group's schedule.
   */
  it('parks this group before taking the group another device is on', async () => {
    stores.groupSessions.set({});
    stores.schedule.set({ rounds: [] } as never);
    stores.selectedIds.set(['p1', 'p2']);
    alreadySynced();
    outbox.set({});
    const at = tick();
    server.rosters = [serverRoster('g2', 'Thursday')];
    server.preferences = [
      { user_id: ME, active_roster_id: 'g2', updated_at: at, server_updated_at: at }
    ];

    startSync();
    signIn(ME);
    await settle();

    expect(stores.activeRosterId.get()).toBe('g2');
    // Thursday has never been set up, so the slot is empty rather than holding
    // Tuesday's session under Thursday's name.
    expect(stores.schedule.get()).toBeNull();
    expect(stores.selectedIds.get()).toEqual([]);
    // And Tuesday is where it was left, waiting to be come back to.
    expect(stores.groupSessions.get().g1.selectedIds).toEqual(['p1', 'p2']);
  });

  it('takes a swap hint closed on another device', async () => {
    alreadySynced();
    // Said rather than assumed. These stores are module-level and outlive a
    // test, so a neighbour that closed the hint would otherwise leave this one
    // asserting a value it never changed.
    stores.swapHintDismissed.set(false);
    outbox.set({});
    const at = tick();
    server.preferences = [
      { user_id: ME, swap_hint_dismissed: true, updated_at: at, server_updated_at: at }
    ];

    startSync();
    signIn(ME);
    await settle();

    expect(stores.swapHintDismissed.get()).toBe(true);
  });

  it('applies a delete made elsewhere instead of pushing the row back up', async () => {
    alreadySynced();
    server.rosters = [serverRoster('g1', 'Tuesday')];
    server.players = [
      serverPlayer('p2', 'Ben', ['g1'], {
        deleted_at: '2026-03-01T00:00:00.000Z'
      })
    ];

    startSync();
    signIn(ME);
    await settle();

    expect(names(stores.players.get())).toEqual(['Ava']);
    // A physical delete would be undone the moment this device pushed its copy
    // back. Nothing about Ben goes up.
    expect(rowsFor('players')).toEqual([]);
  });

  it('keeps an unsent local edit rather than overwriting it with the server copy', async () => {
    alreadySynced();
    // The user renamed Ava a moment ago. It is in the store and in the outbox,
    // and it has not gone up yet.
    const renamed: Player = {
      id: 'p1',
      name: 'Ava Renamed',
      rating: 4,
      gender: 'F',
      rosterIds: ['g1']
    };
    stores.players.set((prev) => prev.map((p) => (p.id === 'p1' ? renamed : p)));
    outbox.set({
      [entryKey('players', 'p1')]: {
        table: 'players',
        id: 'p1',
        row: playerRow(renamed, '2026-03-02T00:00:00.000Z')
      }
    });
    server.players = [serverPlayer('p1', 'Ava Stale', ['g1'])];
    // The push cannot get through, so nothing repairs a bad apply. This is the
    // shape the bug would take in real life: a dead spot, an edit on screen,
    // and a pull that quietly replaces it with the copy it was meant to fix.
    server.failPush = true;

    startSync();
    signIn(ME);
    await settle();

    // The local copy is newer by definition: it is the one still on its way up.
    expect(stores.players.get().find((p) => p.id === 'p1')?.name).toBe('Ava Renamed');
    expect(pendingCount()).toBe(1);
  });

  it('does not send back what it has just read', async () => {
    alreadySynced();
    server.players = [serverPlayer('p9', 'Cal', ['g1'])];

    startSync();
    signIn(ME);
    await settle();

    expect(names(stores.players.get())).toContain('Cal');
    expect(server.pushed).toEqual([]);
  });

  it('remembers how far it read, so the next pull asks for less', async () => {
    alreadySynced();
    server.rosters = [serverRoster('g2', 'Sunday')];

    startSync();
    signIn(ME);
    await settle();

    expect(__testing.cursorFor(ME).get()).toBe(server.rosters[0].server_updated_at);
  });

  it('checks again when the tab comes back to the front', async () => {
    alreadySynced();
    startSync();
    signIn(ME);
    await settle();
    expect(names(stores.players.get())).toEqual(['Ava', 'Ben']);

    // The phone at the court added somebody while this window sat open.
    server.players = [serverPlayer('p9', 'Cal', ['g1'])];
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();

    expect(names(stores.players.get())).toContain('Cal');
  });

  it('moves the open group off one that was deleted elsewhere', async () => {
    alreadySynced();
    server.rosters = [
      serverRoster('g1', 'Tuesday', '2026-03-01T00:00:00.000Z'),
      serverRoster('g2', 'Sunday')
    ];

    startSync();
    signIn(ME);
    await settle();

    expect(stores.activeRosterId.get()).toBe('g2');
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
      expect.objectContaining({ id: 'p1', rating: 4.75, deleted_at: null })
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
    expect(rowsFor('preferences')[0]).toMatchObject({
      num_courts: 5,
      large_text: true
    });
  });

  /**
   * The swap hint is a thing a person learns once, not a thing a device learns
   * once, so closing it rides on the account. Both halves are worth pinning:
   * that closing it pushes at all, and that nothing can ever push it back open.
   */
  it('pushes closing the swap hint on its own, with no other change to carry it', async () => {
    await signedInAndSeeded();

    stores.swapHintDismissed.set(true);
    await settle();

    expect(rowsFor('preferences')[0]).toMatchObject({ swap_hint_dismissed: true });
  });

  it('pushes turning scoring on on its own, for the same reason', async () => {
    await signedInAndSeeded();

    stores.scoringEnabled.set(true);
    await settle();

    expect(rowsFor('preferences')[0]).toMatchObject({ scoring_enabled: true });
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
    expect(syncStatusStore.get()).toMatchObject({
      state: 'waiting',
      pending: 1
    });

    server.failPush = false;
    window.dispatchEvent(new Event('online'));
    await settle();

    expect(rowsFor('players')).toEqual([expect.objectContaining({ id: 'p1', rating: 5 })]);
    expect(pendingCount()).toBe(0);
  });

  it('says so when the account is full, rather than blaming the network', async () => {
    await signedInAndSeeded();

    // The per-account limits in supabase/migrations/0003_row_caps.sql. Every
    // other push failure is worth retrying, so the generic message promises a
    // retry. This one is refused identically every time, and reporting it as
    // "couldn't reach your account" would send someone looking at their wifi
    // for a problem that is in their data.
    server.failPush =
      'This account is full. It can hold 2000 players, including ones it has deleted.';
    stores.players.set((prev) => prev.map((p) => (p.id === 'p1' ? { ...p, rating: 5 } : p)));
    await settle();

    expect(syncStatusStore.get()).toMatchObject({
      state: 'waiting',
      problem: expect.stringContaining('This account is full')
    });
  });

  it('catches up an edit made while signed out, which nothing was watching', async () => {
    await signedInAndSeeded();

    // Signing out stops the subscriptions. An edit now is in no outbox and no
    // diff, and the next pull would have written straight over it.
    authState = { status: 'signed-out' };
    for (const listener of authListeners) listener();
    stores.players.set((prev) =>
      prev.map((p) => (p.id === 'p1' ? { ...p, name: 'Ava Offline' } : p))
    );
    await settle();
    expect(server.pushed).toEqual([]);

    signIn(ME);
    await settle();

    expect(rowsFor('players')).toEqual([
      expect.objectContaining({ id: 'p1', name: 'Ava Offline' })
    ]);
  });
});

// ----------------------------------------------------- the push that failed --

/**
 * The court case, and the reason any of this exists.
 *
 * A phone on one bar does not go offline. It holds a connection that fails
 * every request, and that is indistinguishable from a working one until
 * something tries. So no `online` event fires, because the interface never
 * dropped. The screen stays awake between rounds, so no `visibilitychange`
 * either. Every trigger the engine had needed something to happen, and standing
 * at a court between games, nothing does.
 *
 * The old behaviour was that the change sat in the outbox until the person
 * happened to edit something else, while the panel said it was trying again.
 */
describe('a push that failed with nobody watching', () => {
  async function signedInAndSeeded() {
    startSync();
    signIn(ME);
    await settle();
    server.pushed = [];
  }

  function editAva() {
    stores.players.set((prev) => prev.map((p) => (p.id === 'p1' ? { ...p, rating: 5 } : p)));
  }

  it('comes back on its own, with no online event and no further edit', async () => {
    await signedInAndSeeded();

    server.failPush = true;
    editAva();
    await settle();
    expect(pendingCount()).toBe(1);

    // The dead spot ends, and nothing announces it. The host has pocketed the
    // phone and is playing the next game.
    server.failPush = false;
    await vi.advanceTimersByTimeAsync(20_000);
    await settle();

    expect(rowsFor('players')).toEqual([expect.objectContaining({ id: 'p1', rating: 5 })]);
    expect(pendingCount()).toBe(0);
    expect(syncStatusStore.get()).toEqual({ state: 'saved' });
  });

  it('gets through a flapping signal that fails more often than it works', async () => {
    await signedInAndSeeded();

    server.failPush = true;
    editAva();
    await settle();

    // Signal that comes and goes without ever dropping the interface, so the
    // browser reports nothing throughout. Most retries land in a dead patch and
    // the one that works has to be found by persistence rather than by an event.
    for (let i = 0; i < 6; i += 1) {
      server.failPush = i % 2 === 0;
      await vi.advanceTimersByTimeAsync(45_000);
    }

    server.failPush = false;
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    await settle();

    expect(pendingCount()).toBe(0);
    expect(rowsFor('players')).toEqual([expect.objectContaining({ id: 'p1', rating: 5 })]);
  });

  it('backs off rather than hammering, when the signal never comes back', async () => {
    await signedInAndSeeded();

    server.failPush = true;
    editAva();
    await settle();

    const before = upserts;
    // Half an hour in a dead spot. Capped at five minutes a try that is a
    // handful of requests. At the ordinary 1.5 second debounce it would be
    // twelve hundred, which is a flat battery and the bug this cap prevents.
    await vi.advanceTimersByTimeAsync(30 * 60_000);

    expect(upserts - before).toBeGreaterThan(0);
    expect(upserts - before).toBeLessThan(15);
  });

  it('does not retry a full account, which would spend the battery to be told no', async () => {
    await signedInAndSeeded();

    server.failPush =
      'This account is full. It can hold 2000 players, including ones it has deleted.';
    editAva();
    await settle();

    const before = upserts;
    await vi.advanceTimersByTimeAsync(30 * 60_000);

    // The same batch is refused identically every time. describe() deliberately
    // does not promise a retry for this one, and this is that promise kept.
    expect(upserts).toBe(before);
    expect(syncStatusStore.get()).toMatchObject({
      state: 'waiting',
      problem: expect.stringContaining('This account is full')
    });
  });

  it('never waits longer than five minutes, however long the dead spot ran', async () => {
    await signedInAndSeeded();

    server.failPush = true;
    editAva();
    await settle();
    // Two hours with no signal. Doubling with no ceiling would by now be waiting
    // hours, so a rating changed at the court would still not be up long after
    // the drive home, with the panel insisting it was trying.
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);

    server.failPush = false;
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    await settle();

    expect(pendingCount()).toBe(0);
    expect(rowsFor('players')).toEqual([expect.objectContaining({ id: 'p1', rating: 5 })]);
  });

  it('goes back to checking often when the browser says the network returned', async () => {
    await signedInAndSeeded();

    server.failPush = true;
    editAva();
    await settle();
    // Long enough that the delay has reached its five minute ceiling.
    await vi.advanceTimersByTimeAsync(30 * 60_000);

    // The interface is back, but it is a false dawn and the signal still is not
    // carrying. Leaving the delay at the ceiling would go quiet for five minutes
    // at the exact moment there is most reason to try.
    window.dispatchEvent(new Event('online'));
    await settle();

    const before = upserts;
    await vi.advanceTimersByTimeAsync(20_000);

    expect(upserts).toBeGreaterThan(before);
  });

  it('starts the next dead spot from a short wait, not from where the last one ended', async () => {
    await signedInAndSeeded();

    // A long dead spot, so the delay grows to its ceiling.
    server.failPush = true;
    editAva();
    await settle();
    await vi.advanceTimersByTimeAsync(30 * 60_000);

    server.failPush = false;
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    await settle();
    expect(pendingCount()).toBe(0);

    // A second, unrelated dead spot, an hour of good signal later.
    server.failPush = true;
    stores.players.set((prev) => prev.map((p) => (p.id === 'p2' ? { ...p, rating: 2 } : p)));
    await settle();
    const before = upserts;

    // Twenty seconds is enough for the first retry only if the counter went
    // back to the base delay. Left at the ceiling this would still be waiting,
    // and a change made after a good hour would sit there for five minutes.
    await vi.advanceTimersByTimeAsync(20_000);

    expect(upserts).toBeGreaterThan(before);
  });
});
