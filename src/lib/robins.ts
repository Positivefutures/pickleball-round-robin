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
 * The costume already fetched and decoded, waiting for the open it belongs to.
 *
 * In memory rather than in storage on purpose. It is not a fact about the host,
 * it is a picture this tab has ready, and a reload throws the picture away.
 * warmRobin() runs again on the next mount and queues another.
 *
 * The Image is kept alive along with the name. Dropping it leaves the bytes in
 * the HTTP cache but lets the decoded copy be collected, which is the half that
 * costs the frame.
 */
let queued: { costume: number; src: string; img: HTMLImageElement } | null = null;

/**
 * Fetches and decodes the next costume, so the drawer opens with it already
 * there.
 *
 * Setting `src` on an image on screen does not change what is on screen. The
 * browser goes on painting the picture it has until the new one has been
 * fetched and decoded, which measured at 400ms on a slow connection: the drawer
 * slid open showing the app icon and the bird arrived afterwards, which gives
 * the joke away as a glitch.
 *
 * So the work happens an open early. Called on mount and after every plain
 * open, and it only reaches the network when a costume is genuinely next, which
 * is one file of about 10 KB roughly every third visit to the drawer. A session
 * that never gets near one never fetches anything.
 *
 * Returns what it queued, or null when nothing was due.
 */
export function warmRobin(): string | null {
  if (queued) return queued.src;
  if (!isCostumeOpen(settingsOpens.get() + 1)) return null;

  const costume = pickCostume(Math.random(), lastRobin.get());
  const src = robinSrc(ROBIN_COSTUMES[costume]);
  const img = new Image();
  img.src = src;
  // decode() rather than onload: it resolves when the picture can be painted
  // without costing a frame, which is the whole point. A rejection means the
  // file did not arrive, and the drawer falling back to a late swap is a better
  // answer than an unhandled rejection.
  void img.decode().catch(() => {});
  queued = { costume, src, img };
  return src;
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

  if (!isCostumeOpen(opens)) {
    // The next one may be due, in which case this is the moment to go and get
    // it: the host has to close this drawer and open it again first.
    warmRobin();
    return PLAIN_ROBIN;
  }

  // Warmed on the open before this one, except on a device that has just
  // arrived at a costume open some other way. Picking here still works, it is
  // only the first frame that suffers.
  const pick = queued ?? {
    costume: pickCostume(Math.random(), lastRobin.get()),
    src: '',
  };
  const costume = pick.costume;
  queued = null;
  lastRobin.set(costume);
  return pick.src || robinSrc(ROBIN_COSTUMES[costume]);
}

export const __robinTesting = {
  forget() {
    queued = null;
  },
};
