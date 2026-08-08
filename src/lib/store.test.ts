/**
 * @vitest-environment happy-dom
 *
 * The store replaced a hook that read localStorage once per mount, inside a
 * lazy useState initializer. Most of what is pinned here is that guarantee and
 * its two edges: a first render must see what is actually stored, and a render
 * pass must never see the value change under it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStoredValue } from './store';

beforeEach(() => localStorage.clear());

/** Subscribes and returns the calls counter plus the unsubscribe. */
function watch(store: { subscribe(l: () => void): () => void }) {
  const listener = vi.fn();
  const off = store.subscribe(listener);
  return { listener, off };
}

describe('reading', () => {
  it('reads what is stored, and falls back when the key is absent', () => {
    localStorage.setItem('k', JSON.stringify([1, 2]));
    expect(createStoredValue<number[]>('k', []).get()).toEqual([1, 2]);
    expect(createStoredValue<number[]>('absent', [9]).get()).toEqual([9]);
  });

  it('falls back on malformed JSON rather than throwing', () => {
    localStorage.setItem('k', '{not json');
    expect(createStoredValue('k', 'fallback').get()).toBe('fallback');
  });

  it('accepts a lazy initial, and does not call it before the first read', () => {
    const initial = vi.fn(() => 'computed');
    const store = createStoredValue('k', initial);
    // runMigrations() reshapes storage before React mounts, so evaluating
    // anything at import time would run too early.
    expect(initial).not.toHaveBeenCalled();
    expect(store.get()).toBe('computed');
  });
});

describe('writing', () => {
  it('writes through to storage and notifies subscribers', () => {
    const store = createStoredValue<number>('k', 0);
    const { listener } = watch(store);

    store.set(5);

    expect(store.get()).toBe(5);
    expect(localStorage.getItem('k')).toBe('5');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('passes the previous value to a functional set', () => {
    const store = createStoredValue<number[]>('k', [1]);
    store.set((prev) => [...prev, 2]);
    expect(store.get()).toEqual([1, 2]);
  });

  it('stops notifying once unsubscribed', () => {
    const store = createStoredValue('k', 0);
    const { listener, off } = watch(store);
    off();
    store.set(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the value in memory when storage refuses the write', () => {
    const store = createStoredValue<number>('k', 0);
    watch(store); // subscribed, so the cache is authoritative
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    store.set(42);
    expect(store.get()).toBe(42);

    // And the failure must not leave the store poised to reload the old bytes
    // over the top the next time it revalidates.
    setItem.mockRestore();
    expect(store.get()).toBe(42);
  });
});

describe('when nothing is subscribed', () => {
  it('re-reads storage, so a fresh mount sees what is actually stored', () => {
    localStorage.setItem('k', JSON.stringify('first'));
    const store = createStoredValue('k', 'fallback');
    expect(store.get()).toBe('first');

    // What the walkthrough test does between cases: wipe, seed, mount again.
    // Reading a cache left over from the previous mount put the app on the
    // wrong step.
    localStorage.clear();
    localStorage.setItem('k', JSON.stringify('second'));
    expect(store.get()).toBe('second');
  });

  it('hands back the same object while the stored bytes are unchanged', () => {
    localStorage.setItem('k', JSON.stringify({ a: 1 }));
    const store = createStoredValue<{ a: number }>('k', { a: 0 });

    // useSyncExternalStore compares snapshots by identity, so a re-read that
    // found the same bytes must not look like a change.
    expect(store.get()).toBe(store.get());
  });
});

describe('while subscribed', () => {
  it('does not re-read, so a render pass cannot see the value shift', () => {
    localStorage.setItem('k', JSON.stringify('first'));
    const store = createStoredValue('k', 'fallback');
    watch(store);
    expect(store.get()).toBe('first');

    localStorage.setItem('k', JSON.stringify('written elsewhere'));

    expect(store.get()).toBe('first');
  });

  it('picks up an outside write once nothing is subscribed again', () => {
    localStorage.setItem('k', JSON.stringify('first'));
    const store = createStoredValue('k', 'fallback');
    const { off } = watch(store);
    expect(store.get()).toBe('first');

    localStorage.setItem('k', JSON.stringify('second'));
    off();

    expect(store.get()).toBe('second');
  });
});
