import { lastRobin, settingsOpens } from './stores';

/**
 * The robin in fancy dress at the head of the settings drawer.
 *
 * A joke that has to stay a joke, which means it has to stay rare. Somebody who
 * saw a different bird every single time would read it as the app being unable
 * to make up its mind, so the drawer opens on the ordinary app icon almost
 * always and puts a costume on once in a while.
 *
 * Two rules, one number each, and both are here rather than spelled into the
 * condition so that either can be moved without reading the code around it:
 *
 * - The first three opens are the plain icon, full stop. A new host is still
 *   working out where things are, and the drawer must look like the same drawer
 *   each time while they do.
 * - After that, one open in three. So the first costume lands on the sixth open,
 *   and there are two ordinary opens between any two of them.
 *
 * Nothing here is synced, and none of it matters if it is lost: a new device
 * starts its own count and gets its own three plain opens.
 */

/** The app icon, which is what the drawer shows nearly every time. */
export const PLAIN_ROBIN = '/icon-192.png';

/**
 * The twelve, by what each one is wearing. The file names are the same words,
 * so `precache.test.ts` reading `public/robins/` against this list catches a
 * costume added to one and not the other.
 *
 * Order is alphabetical and means nothing — the pick is random.
 */
export const ROBIN_COSTUMES = [
  'bedtime',
  'chef',
  'cowboy',
  'detective',
  'hippie',
  'paddle',
  'rockstar',
  'shower',
  'snorkel',
  'spa',
  'toilet',
  'workout',
] as const;

export function robinSrc(costume: string): string {
  return `/robins/${costume}.webp`;
}

/** Opens that are the plain icon before any of this starts. */
export const PLAIN_OPENS = 3;

/** And after those, one open in this many wears a costume. */
export const COSTUME_EVERY = 3;

/** Whether the nth open of the drawer is one of the dressed-up ones. */
export function isCostumeOpen(opens: number): boolean {
  return opens > PLAIN_OPENS && opens % COSTUME_EVERY === 0;
}

/**
 * Which costume to wear, given a roll in [0, 1) and the one worn last.
 *
 * Never the same one twice running. With twelve to choose from a repeat would
 * come up about one time in twelve, and a repeat is the one outcome that reads
 * as broken rather than as a joke: the whole point is that it changed. Rolling
 * over the eleven others rather than re-rolling keeps it to one draw and keeps
 * the odds even across them.
 *
 * `last` is -1 on a device that has not shown one yet, and any index out of
 * range is treated the same way.
 */
export function pickCostume(roll: number, last: number): number {
  const n = ROBIN_COSTUMES.length;
  if (last < 0 || last >= n) return Math.min(Math.floor(roll * n), n - 1);
  const i = Math.min(Math.floor(roll * (n - 1)), n - 2);
  return i >= last ? i + 1 : i;
}

/**
 * Counts an open of the settings drawer and hands back the picture to show.
 *
 * Called from the button that opens the drawer rather than from the drawer
 * itself, which is always mounted: an effect on it would fire on the way out as
 * well and change the bird while it slid off the screen.
 */
export function openedSettings(): string {
  const opens = settingsOpens.get() + 1;
  settingsOpens.set(opens);
  if (!isCostumeOpen(opens)) return PLAIN_ROBIN;

  const costume = pickCostume(Math.random(), lastRobin.get());
  lastRobin.set(costume);
  return robinSrc(ROBIN_COSTUMES[costume]);
}
