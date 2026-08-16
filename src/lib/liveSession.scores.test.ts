/**
 * @vitest-environment happy-dom
 *
 * The host's half of letting the watchers change a score.
 *
 * Its own file rather than more of liveSession.test.ts, because it needs a
 * server that answers two tables and knows the difference. That file's fake
 * answers `from()` without looking at what was asked for, which is right for
 * what it tests and would quietly hide everything here.
 *
 * Three failures are worth the file. A code that is set but never published is
 * a host reading four digits to a court where none of them work. A switch
 * turned off that leaves the hash behind is a session still taking edits from
 * people the host has stopped. And a drain that writes the schedule whether or
 * not anything changed is a live share republishing itself every ten seconds
 * for the rest of the afternoon.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { AuthState } from './auth';
import type { Player, Schedule } from '../types';

// ------------------------------------------------------------ a fake server --

interface SharedRow {
  share_key: string;
  snapshot: { scoreEditing?: boolean; [key: string]: unknown };
  score_code_hash: string | null;
  score_code_salt: string | null;
  [key: string]: unknown;
}

interface EditRow {
  id: number;
  share_key: string;
  round_index: number;
  court_index: number;
  team1: number;
  team2: number;
}

let shared: SharedRow[] = [];
/** How many times the session has gone up, so a missing publish is visible. */
let published = 0;
let queue: EditRow[] = [];
/** Every select and delete aimed at score_edits, so a chatty poll is visible. */
let reads: number;
let removed: number[][];
let deleteFails = false;

function editsTable() {
  const wanted: { column: string; value: unknown }[] = [];
  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      wanted.push({ column, value });
      return builder;
    },
    order() {
      reads += 1;
      const rows = queue
        .filter((row) => wanted.every((t) => row[t.column as keyof EditRow] === t.value))
        .sort((a, b) => a.id - b.id);
      return Promise.resolve({ data: rows, error: null });
    },
    in(column: string, values: number[]) {
      removed.push(values);
      if (deleteFails) return Promise.resolve({ error: { message: 'Failed to fetch' } });
      queue = queue.filter((row) => !values.includes(row[column as keyof EditRow] as number));
      return Promise.resolve({ error: null });
    },
    delete() {
      return builder;
    }
  };
  return builder;
}

function sharedTable() {
  return {
    insert(row: SharedRow) {
      published += 1;
      shared.push(row);
      return Promise.resolve({ error: null });
    },
    upsert(row: SharedRow) {
      published += 1;
      const at = shared.findIndex((held) => held.share_key === row.share_key);
      if (at === -1) shared.push(row);
      else shared[at] = row;
      return Promise.resolve({ error: null });
    },
    delete() {
      const builder = {
        eq: () => builder,
        neq: () => builder,
        then(resolve: (result: { error: null }) => void) {
          resolve({ error: null });
        }
      };
      return builder;
    }
  };
}

const client = {
  from(table: string) {
    return table === 'score_edits' ? editsTable() : sharedTable();
  }
};

let authState: AuthState = { status: 'signed-in', email: 'host@example.com', userId: 'u1' };

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
    subscribe: () => () => {}
  }
}));

const { startSharing, __testing } = await import('./liveSession');
const stores = await import('./stores');

// ---------------------------------------------------------------- a session --

function player(name: string): Player {
  return { id: `id-${name}`, name, rating: 3.5, gender: 'F', rosterIds: ['g1'] };
}

const roster = [player('Ava'), player('Ben'), player('Cara'), player('Dee')];

/** Two rounds of one court, so a round index is a real choice. */
function schedule(): Schedule {
  const courts = () => [
    {
      courtNumber: 1,
      team1: [roster[0], roster[1]],
      team2: [roster[2], roster[3]],
      ratingDiff: 0
    }
  ];
  return {
    rounds: [
      { roundNumber: 1, courts: courts(), sitOuts: [] },
      { roundNumber: 2, courts: courts(), sitOuts: [] }
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
  stores.scoreEditingAllowed.set(false);
  stores.scoreEditCode.set(null);
  stores.schedule.set(schedule());
}

const row = () => shared[0];
const scoreAt = (round: number, court: number) =>
  stores.schedule.get()?.rounds[round]?.courts[court]?.score;

function queued(edits: Omit<EditRow, 'share_key'>[]) {
  queue = edits.map((edit) => ({ ...edit, share_key: __testing.key ?? '' }));
}

beforeEach(() => {
  shared = [];
  published = 0;
  queue = [];
  reads = 0;
  removed = [];
  deleteFails = false;
  authState = { status: 'signed-in', email: 'host@example.com', userId: 'u1' };
  window.localStorage.clear();
  __testing.reset();
  seed();
});

afterEach(() => {
  __testing.reset();
});

// -------------------------------------------------------------- publishing --

describe('publishing the code', () => {
  it('sends nothing while editing is off', async () => {
    await startSharing();
    expect(row().score_code_hash).toBeNull();
    expect(row().score_code_salt).toBeNull();
    expect(row().snapshot.scoreEditing).toBe(false);
  });

  it('sends a salted hash once the switch is on and four digits are typed', async () => {
    stores.scoreEditingAllowed.set(true);
    stores.scoreEditCode.set('4719');
    await startSharing();

    const { score_code_hash: hash, score_code_salt: salt } = row();
    expect(salt).not.toBeNull();
    expect(hash).toBe(createHash('sha256').update(`${salt}4719`, 'utf8').digest('hex'));
    expect(row().snapshot.scoreEditing).toBe(true);
  });

  it('never sends the code itself, anywhere in the row', async () => {
    stores.scoreEditingAllowed.set(true);
    stores.scoreEditCode.set('4719');
    await startSharing();
    expect(JSON.stringify(row())).not.toContain('4719');
  });

  it('holds back a half typed code rather than publishing a switch nothing opens', async () => {
    stores.scoreEditingAllowed.set(true);
    stores.scoreEditCode.set('47');
    await startSharing();
    expect(row().score_code_hash).toBeNull();
    // And says so on the document, so a watcher is not offered a prompt for a
    // code that cannot exist yet.
    expect(row().snapshot.scoreEditing).toBe(false);
  });

  it('clears both columns when the switch goes off', async () => {
    stores.scoreEditingAllowed.set(true);
    stores.scoreEditCode.set('4719');
    await startSharing();
    expect(row().score_code_hash).not.toBeNull();

    stores.scoreEditingAllowed.set(false);
    stores.scoreEditCode.set(null);
    await __testing.publishNow();

    // Null rather than absent. An upsert writes only the columns it is given,
    // so leaving them out would leave the old hash working.
    expect(row()).toHaveProperty('score_code_hash', null);
    expect(row()).toHaveProperty('score_code_salt', null);
    expect(row().snapshot.scoreEditing).toBe(false);
  });

  it('republishes when the code is typed, without the schedule being touched', async () => {
    await startSharing();
    const atStart = published;

    // The switch first, with no code behind it yet. That publish goes up on
    // its own and carries nothing, which is the state a host is in for the few
    // seconds it takes them to type.
    stores.scoreEditingAllowed.set(true);
    await vi.waitFor(() => expect(published).toBeGreaterThan(atStart), 4000);
    expect(row().score_code_hash).toBeNull();

    // Now only the code changes, and nothing here asks for a publish. The
    // publisher watches the stores; a code typed into a store nobody watches
    // is four digits the host reads out that open nothing.
    stores.scoreEditCode.set('4719');
    await vi.waitFor(() => expect(row().score_code_hash).not.toBeNull(), 4000);
  });
});

// ----------------------------------------------------------------- draining --

describe('taking the scores the watchers left', () => {
  beforeEach(async () => {
    stores.scoreEditingAllowed.set(true);
    stores.scoreEditCode.set('4719');
    await startSharing();
  });

  it('writes a queued score onto the right court', async () => {
    queued([{ id: 1, round_index: 1, court_index: 0, team1: 11, team2: 9 }]);
    await __testing.drainNow();

    expect(scoreAt(1, 0)).toEqual({ team1: 11, team2: 9 });
    // And nowhere else. A round index read as a round number would land here.
    expect(scoreAt(0, 0)).toBeUndefined();
  });

  it('clears what it has taken', async () => {
    queued([{ id: 1, round_index: 0, court_index: 0, team1: 11, team2: 9 }]);
    await __testing.drainNow();
    expect(queue).toHaveLength(0);
    expect(removed).toEqual([[1]]);
  });

  it('applies them oldest first, so the last word wins', async () => {
    queued([
      { id: 1, round_index: 0, court_index: 0, team1: 11, team2: 2 },
      { id: 2, round_index: 0, court_index: 0, team1: 11, team2: 7 }
    ]);
    await __testing.drainNow();
    expect(scoreAt(0, 0)).toEqual({ team1: 11, team2: 7 });
  });

  it('publishes what it took, so the watchers see their own score come back', async () => {
    queued([{ id: 1, round_index: 0, court_index: 0, team1: 11, team2: 9 }]);
    await __testing.drainNow();

    // The drain writes the schedule; the schedule is watched; the watcher
    // schedules a publish. Nothing here calls publish itself.
    await vi.waitFor(() => {
      expect(
        (row().snapshot as { schedule: Schedule }).schedule.rounds[0].courts[0].score
      ).toEqual({ team1: 11, team2: 9 });
    }, 3000);
  });

  it('throws away the queue instead of applying it when editing has been switched off', async () => {
    queued([{ id: 1, round_index: 0, court_index: 0, team1: 11, team2: 9 }]);
    stores.scoreEditingAllowed.set(false);

    // Nothing here asks it to. Switching off is what empties the queue, because
    // a row left behind would be applied by a switch turned back on next
    // Tuesday, carrying today's score with it.
    await vi.waitFor(() => expect(queue).toHaveLength(0));
    expect(scoreAt(0, 0)).toBeUndefined();
  });

  it('ignores a court that is no longer there, and still clears the row', async () => {
    queued([{ id: 1, round_index: 9, court_index: 4, team1: 11, team2: 9 }]);
    await expect(__testing.drainNow()).resolves.toBeUndefined();
    expect(queue).toHaveLength(0);
  });

  it('does not write the schedule when the queue says what it already says', async () => {
    queued([{ id: 1, round_index: 0, court_index: 0, team1: 11, team2: 9 }]);
    await __testing.drainNow();

    // The usual way a row is read twice: the delete never landed.
    deleteFails = true;
    queued([{ id: 1, round_index: 0, court_index: 0, team1: 11, team2: 9 }]);

    let writes = 0;
    const stop = stores.schedule.subscribe(() => (writes += 1));
    await __testing.drainNow();
    stop();

    // A schedule written every pass is a share republishing itself every ten
    // seconds until the afternoon ends.
    expect(writes).toBe(0);
    expect(scoreAt(0, 0)).toEqual({ team1: 11, team2: 9 });
  });

  it('leaves the queue alone when it cannot reach the database', async () => {
    deleteFails = true;
    queued([{ id: 1, round_index: 0, court_index: 0, team1: 11, team2: 9 }]);
    await __testing.drainNow();

    // Applied here and still queued there, which is the safe way round: the
    // next pass writes the same numbers over the same numbers and stops.
    expect(scoreAt(0, 0)).toEqual({ team1: 11, team2: 9 });
    expect(queue).toHaveLength(1);
  });

  it('asks for nothing while nobody is signed in', async () => {
    reads = 0;
    authState = { status: 'signed-out' };
    await __testing.drainNow();
    expect(reads).toBe(0);
  });
});

describe('when the polling runs', () => {
  it('is off until the switch is on', async () => {
    await startSharing();
    expect(__testing.draining).toBe(false);

    stores.scoreEditingAllowed.set(true);
    expect(__testing.draining).toBe(true);
  });

  it('stops when the switch goes off', async () => {
    stores.scoreEditingAllowed.set(true);
    stores.scoreEditCode.set('4719');
    await startSharing();
    expect(__testing.draining).toBe(true);

    stores.scoreEditingAllowed.set(false);
    expect(__testing.draining).toBe(false);
  });

  it('stops when the share does', async () => {
    stores.scoreEditingAllowed.set(true);
    stores.scoreEditCode.set('4719');
    await startSharing();

    // However the session ends, it ends by the schedule going null.
    stores.schedule.set(null);
    await vi.waitFor(() => expect(__testing.draining).toBe(false));
    expect(__testing.key).toBeNull();
  });
});
