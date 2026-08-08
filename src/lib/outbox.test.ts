/**
 * @vitest-environment happy-dom
 *
 * The outbox decides what a device sends up, so its two jobs are the two ways
 * sync loses data: sending a row it should not have (clobbering newer work with
 * a stale cache) and not sending one it should (a change that quietly never
 * arrives). Everything below is one or the other.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Player, Roster } from '../types';
import {
  diffRows,
  drop,
  enqueue,
  entryKey,
  outbox,
  pendingCount,
  playerRow,
  rosterRow,
} from './outbox';

beforeEach(() => {
  localStorage.clear();
  outbox.set({});
});

const AT = '2026-08-08T12:00:00.000Z';
const LATER = '2026-08-08T12:05:00.000Z';

function player(id: string, over: Partial<Player> = {}): Player {
  return { id, name: `Player ${id}`, rating: 4, gender: 'F', rosterIds: ['g1'], ...over };
}

const roster = (id: string, name: string): Roster => ({ id, name });

// --------------------------------------------------------------------- rows --

describe('row shapes', () => {
  it('renames rosterIds to the column the table actually has', () => {
    expect(playerRow(player('p1', { rosterIds: ['g1', 'g2'] }), AT)).toEqual({
      id: 'p1',
      name: 'Player p1',
      rating: 4,
      gender: 'F',
      roster_ids: ['g1', 'g2'],
      deleted_at: null,
      updated_at: AT,
    });
  });

  it('sends a live row with a null tombstone rather than leaving it out', () => {
    // Omitting it would leave a previously deleted row deleted after it was
    // brought back, because upsert only writes the columns it is given.
    expect(rosterRow(roster('g1', 'Tuesday'), AT).deleted_at).toBeNull();
  });
});

// ------------------------------------------------------------------ diffing --

describe('diffRows', () => {
  it('sends nothing when nothing changed', () => {
    const before = [player('p1'), player('p2')];
    // A different array holding equal values: a re-render, not an edit.
    const after = [player('p1'), player('p2')];
    expect(diffRows('players', before, after, playerRow, AT)).toEqual([]);
  });

  it('sends an added row and an edited one, and leaves the untouched one alone', () => {
    const before = [player('p1'), player('p2')];
    const after = [player('p1'), player('p2', { rating: 4.5 }), player('p3')];

    const entries = diffRows('players', before, after, playerRow, AT);

    expect(entries.map((e) => e.id).sort()).toEqual(['p2', 'p3']);
    expect(entries.find((e) => e.id === 'p2')?.row.rating).toBe(4.5);
  });

  it('notices a change to roster membership, not just to name and rating', () => {
    const before = [player('p1', { rosterIds: ['g1'] })];
    const after = [player('p1', { rosterIds: ['g1', 'g2'] })];

    expect(diffRows('players', before, after, playerRow, AT)).toHaveLength(1);
  });

  it('turns a removal into a tombstone, not a delete', () => {
    // A physical delete would be undone the moment the other device pushed its
    // copy of the row back up.
    const entries = diffRows('players', [player('p1')], [], playerRow, AT);

    expect(entries).toHaveLength(1);
    expect(entries[0].row.deleted_at).toBe(AT);
    // The row still has to satisfy the not-null columns to be upsertable.
    expect(entries[0].row.name).toBe('Player p1');
  });

  it('does not treat reordering as an edit', () => {
    const before = [player('p1'), player('p2')];
    const after = [player('p2'), player('p1')];
    expect(diffRows('players', before, after, playerRow, AT)).toEqual([]);
  });

  it('stamps every entry with the time it was made, tombstones included', () => {
    const entries = diffRows('rosters', [roster('g1', 'Tuesday')], [roster('g2', 'Friday')], rosterRow, AT);
    expect(entries.every((e) => e.row.updated_at === AT)).toBe(true);
  });
});

// ------------------------------------------------------------- the outbox --

describe('the outbox', () => {
  it('coalesces repeated edits to one row into a single entry', () => {
    // Typing a name is one change to push, not one per keystroke.
    for (const name of ['A', 'Av', 'Ava', 'Ava ', 'Ava B']) {
      enqueue(diffRows('players', [player('p1')], [player('p1', { name })], playerRow, AT));
    }

    expect(pendingCount()).toBe(1);
    expect(outbox.get()[entryKey('players', 'p1')].row.name).toBe('Ava B');
  });

  it('keeps one entry per row per table, so two tables never collide', () => {
    enqueue([
      { table: 'rosters', id: 'x', row: rosterRow(roster('x', 'Tuesday'), AT) },
      { table: 'players', id: 'x', row: playerRow(player('x'), AT) },
    ]);
    expect(pendingCount()).toBe(2);
  });

  it('lets a later delete supersede an earlier edit of the same row', () => {
    enqueue(diffRows('players', [player('p1')], [player('p1', { rating: 5 })], playerRow, AT));
    enqueue(diffRows('players', [player('p1')], [], playerRow, LATER));

    expect(pendingCount()).toBe(1);
    expect(outbox.get()[entryKey('players', 'p1')].row.deleted_at).toBe(LATER);
  });

  it('survives a reload, because a killed tab must not lose an edit', () => {
    enqueue([{ table: 'players', id: 'p1', row: playerRow(player('p1'), AT) }]);

    const raw = localStorage.getItem('pb-sync-outbox');
    expect(raw).toBeTruthy();
    expect(Object.keys(JSON.parse(raw!))).toEqual(['players:p1']);
  });

  it('drops only what was pushed, keeping anything queued since', () => {
    enqueue([{ table: 'players', id: 'p1', row: playerRow(player('p1'), AT) }]);
    const inFlight = Object.keys(outbox.get());

    // The user carries on editing while the push is away.
    enqueue([{ table: 'players', id: 'p2', row: playerRow(player('p2'), LATER) }]);
    drop(inFlight);

    expect(Object.keys(outbox.get())).toEqual(['players:p2']);
  });
});
