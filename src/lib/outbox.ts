import type { Player, Roster } from '../types';
import { createStoredValue } from './store';

/**
 * What has changed locally and not yet reached the server.
 *
 * The one property that matters: a device only ever pushes rows the user
 * actually touched. A phone that has been in a bag for a month holds stale
 * copies of everything, and on reconnecting it uploads the two players it
 * edited rather than its whole cache over the top of newer work. "Sync = upsert
 * everything local" is the design that gets this wrong, and it is the design
 * that loses data.
 *
 * The outbox is a map keyed by `table:rowId`, so editing one player five times
 * leaves one entry holding the latest values, not five entries replaying the
 * keystrokes. It is persisted, so closing the tab mid-edit does not drop the
 * change.
 *
 * Entries carry the whole row rather than a reference to it. That costs a
 * little space and buys two things: a push needs nothing but the outbox, and a
 * deleted row can still be described after it has gone from the store.
 */

export type SyncTable = 'rosters' | 'players' | 'preferences';

/**
 * The preferences row's key within the outbox. The table itself is keyed by
 * user_id alone — one row per person — so there is no id to use, and any
 * constant would do as long as it is the same one every time.
 */
export const PREFERENCES_ID = 'me';

/** Column names exactly as the tables spell them, ready to hand to upsert. */
export type Row = Record<string, unknown>;

export interface OutboxEntry {
  table: SyncTable;
  id: string;
  row: Row;
}

export type Outbox = Record<string, OutboxEntry>;

export function entryKey(table: SyncTable, id: string): string {
  return `${table}:${id}`;
}

export const outbox = createStoredValue<Outbox>('pb-sync-outbox', {});

/** Later entries for a row replace earlier ones. That is the coalescing. */
export function enqueue(entries: OutboxEntry[]): void {
  if (entries.length === 0) return;
  outbox.set((prev) => {
    const next = { ...prev };
    for (const entry of entries) next[entryKey(entry.table, entry.id)] = entry;
    return next;
  });
}

/**
 * Removes the entries a push got through. Re-reads rather than working from the
 * caller's copy, so an edit made while the push was in flight survives it.
 */
export function drop(keys: string[]): void {
  if (keys.length === 0) return;
  outbox.set((prev) => {
    const next = { ...prev };
    for (const key of keys) delete next[key];
    return next;
  });
}

export function pendingCount(): number {
  return Object.keys(outbox.get()).length;
}

// ------------------------------------------------------------ row builders --
// Local shape in, database shape out. The translation is field renaming and
// nothing else, which is the whole reason the tables were shaped to mirror the
// local types.

export function rosterRow(roster: Roster, at: string): Row {
  return { id: roster.id, name: roster.name, deleted_at: null, updated_at: at };
}

export function playerRow(player: Player, at: string): Row {
  return {
    id: player.id,
    name: player.name,
    rating: player.rating,
    gender: player.gender,
    roster_ids: player.rosterIds,
    deleted_at: null,
    updated_at: at,
  };
}

// ------------------------------------------------------------------- diffing --

/**
 * A stamp that is the same on both sides of a comparison, so only real field
 * changes register. Without it every row would look edited, because the two
 * rows being compared were built a moment apart.
 */
const IGNORED_STAMP = '';

/**
 * Works out what changed between two versions of a list, as rows to push.
 *
 * Diffing the list rather than instrumenting every mutation is deliberate: the
 * mutations live across two hooks and a 700-line component, and one that forgot
 * to report itself would go missing silently. A list has nowhere to hide.
 *
 * Removals become tombstones, never deletes. A physical delete would be undone
 * the moment another device pushed its copy of the row back up — it still has
 * one, and has no way to know the row was meant to be gone.
 */
export function diffRows<T extends { id: string }>(
  table: SyncTable,
  prev: T[],
  next: T[],
  toRow: (item: T, at: string) => Row,
  at: string
): OutboxEntry[] {
  const entries: OutboxEntry[] = [];
  const before = new Map(prev.map((item) => [item.id, item]));

  for (const item of next) {
    const was = before.get(item.id);
    before.delete(item.id);
    if (was && sameRow(toRow(was, IGNORED_STAMP), toRow(item, IGNORED_STAMP))) continue;
    entries.push({ table, id: item.id, row: toRow(item, at) });
  }

  // Whatever is left was in the old list and is not in the new one.
  for (const gone of before.values()) {
    entries.push({ table, id: gone.id, row: { ...toRow(gone, at), deleted_at: at } });
  }

  return entries;
}

/**
 * Rows are flat and small, so stringifying is both correct and cheaper than
 * hand-written comparison. Key order is stable because one builder makes both.
 */
function sameRow(a: Row, b: Row): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
