import { useEffect, useRef } from 'react';

/**
 * Keeps the screen from locking while `active` is true.
 *
 * This is the whole reason the Round Timer panel exists in the shape it does:
 * a phone left face-up at the net, counting down twelve minutes, needs to
 * still be lit when the point is over.
 *
 * The Wake Lock API releases itself the moment the tab is hidden — silently,
 * with no event on `navigator.wakeLock` itself, only the sentinel's own
 * `release` event — so this listens for that rather than trusting the ref to
 * still hold a live lock after a background/foreground cycle, and re-acquires
 * on the way back to visible. Unsupported browsers and a request denied by
 * battery saver both fail silently: the countdown is still correct either
 * way, the screen just might dim.
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let cancelled = false;

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        lockRef.current = lock;
        lock.addEventListener('release', () => {
          if (lockRef.current === lock) lockRef.current = null;
        });
      } catch {
        // Denied, unsupported, or battery saver — silently do without.
      }
    }
    void acquire();

    function onVisible() {
      if (document.visibilityState === 'visible' && lockRef.current === null) void acquire();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lockRef.current?.release();
      lockRef.current = null;
    };
  }, [active]);
}
