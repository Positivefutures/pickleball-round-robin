/**
 * A persisted value that can be watched.
 *
 * This replaces the useLocalStorage hook, which read its key once in a lazy
 * useState initializer and never read it again. That is fine while the browser
 * is the only writer, but it means nothing outside React can ever put a value
 * on screen — no cross-tab update, and no way for a server to hand back data it
 * holds. A store owns its key and tells its subscribers when it changes.
 *
 * Everything else is deliberately identical to the hook: the same JSON under
 * the same keys, written through synchronously on every set, and a failed write
 * leaving the new value standing in memory.
 *
 * Nothing here touches localStorage until the first read. runMigrations()
 * reshapes storage before React mounts, and an eager read at import time would
 * run before it.
 */

type Listener = () => void;

export interface StoredValue<T> {
  readonly key: string;
  /** The current value. Stable by reference until something changes it. */
  get(): T;
  set(value: T | ((prev: T) => T)): void;
  /** Returns the unsubscribe function. */
  subscribe(listener: Listener): () => void;
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private-mode Safari, and a server render with no window, both land here.
    return null;
  }
}

export function createStoredValue<T>(
  key: string,
  initial: T | (() => T)
): StoredValue<T> {
  const listeners = new Set<Listener>();

  /**
   * The value, alongside the exact string it was parsed from. Keeping the raw
   * string means a re-read that finds the same bytes can hand back the same
   * object, so revalidating costs no render.
   */
  let cache: { value: T; raw: string | null } | null = null;

  function fallback(): T {
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  }

  function parse(raw: string | null): T {
    if (raw === null) return fallback();
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback();
    }
  }

  /** Reads storage, reusing the cached object when the bytes are unchanged. */
  function load() {
    const raw = readRaw(key);
    if (cache && raw === cache.raw) return cache;
    cache = { value: parse(raw), raw };
    return cache;
  }

  return {
    key,

    get() {
      // While nothing is subscribed, storage is the truth and the cache may be
      // left over from a previous mount, so re-read. That keeps the guarantee
      // the old hook gave by reading inside a lazy useState initializer: the
      // first render of a mount sees what is actually stored. It is also what
      // lets a test clear storage, seed it again and mount a second time.
      //
      // Safe to do per call: load() hands back the same object when the bytes
      // are unchanged, so a render pass reading this twice sees one value. Once
      // something is subscribed the cache is authoritative and this costs
      // nothing.
      if (listeners.size === 0) return load().value;
      return (cache ?? load()).value;
    },

    set(next) {
      const prev = (cache ?? load()).value;
      const value = next instanceof Function ? next(prev) : next;
      try {
        const raw = JSON.stringify(value);
        window.localStorage.setItem(key, raw);
        cache = { value, raw };
      } catch {
        // Storage full or unavailable. The value still stands in memory, which
        // is what the hook did too. Recording what storage actually holds means
        // the next revalidation sees no change and leaves the memory value
        // alone, rather than reloading the old bytes over the top.
        cache = { value, raw: readRaw(key) };
      }
      // Unconditional: useSyncExternalStore compares snapshots with Object.is
      // and skips the render itself when a set produced the same value, exactly
      // as useState did.
      for (const listener of listeners) listener();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
