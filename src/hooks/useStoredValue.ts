import { useCallback, useSyncExternalStore } from 'react';
import type { StoredValue } from '../lib/store';

/**
 * Reads a persisted value and re-renders when it changes, wherever it was
 * changed from. The returned tuple matches the useState shape the call sites
 * already used, so they read exactly as they did before.
 *
 * The store's methods are created once per store, so they are stable and need
 * no memoising here. getServerSnapshot is the same reader: it falls back to the
 * initial value where there is no window, which is what a static render wants.
 */
export function useStoredValue<T>(
  store: StoredValue<T>
): [T, (value: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(store.subscribe, store.get, store.get);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => store.set(next),
    [store]
  );

  return [value, setValue];
}
