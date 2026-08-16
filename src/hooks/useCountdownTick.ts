import { useEffect, useState } from 'react';

/** Four times a second, so a second never lands visibly late. */
const TICK_MS = 250;

/**
 * Re-renders whoever calls it, on a tick, for as long as `active`.
 *
 * Purely cosmetic, and deliberately so. Every countdown in this app is drawn by
 * subtracting an absolute deadline from the clock at render time, so the number
 * on screen is right whenever it is drawn — this only decides how often that
 * happens. Nothing depends on the interval firing: a backgrounded tab that
 * throttles it to a crawl still shows the right time the moment it comes back,
 * and the watchdog in lib/roundTimer.ts is what actually decides when a timer
 * has run out.
 *
 * Four places draw a countdown — the host's sheet and the chip on the host's
 * round card, and the same two on a watcher's page — and this is the one thing
 * they all needed and none of them needed differently.
 */
export function useCountdownTick(active: boolean): void {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => bump((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [active]);
}
