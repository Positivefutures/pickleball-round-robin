import { APP_URL } from './appInfo';

export const SHARE_TITLE = 'Pickleball Round Robin Generator';

/**
 * `title` is metadata: targets like Mail use it as the subject, and the ones
 * that send a plain message (Messages, WhatsApp) ignore it.
 *
 * `text` is the message body, and every target that sends one puts it above the
 * link. Sharing the app leaves it off, because a bare link is the whole message
 * there. Sharing a session sets it, because "tap this" is worth saying to a
 * court full of people who did not ask for the link.
 */
export interface SharePayload {
  title: string;
  text?: string;
  url: string;
}

/**
 * - `shared`      the sheet opened and the user sent it
 * - `dismissed`   the sheet opened and the user backed out — a normal outcome
 * - `unsupported` this browser has no share sheet (Firefox desktop, mainly)
 * - `failed`      the sheet was available but errored
 *
 * Only the last two should push the caller to the copy-link fallback; showing a
 * panel to someone who just cancelled would be a nag.
 */
export type ShareOutcome = 'shared' | 'dismissed' | 'unsupported' | 'failed';

type ShareFn = (data: SharePayload) => Promise<void>;

export function sharePayload(): SharePayload {
  return { title: SHARE_TITLE, url: APP_URL };
}

function defaultShare(): ShareFn | undefined {
  if (typeof navigator === 'undefined' || !navigator.share) return undefined;
  return navigator.share.bind(navigator);
}

/**
 * Whether this browser has a share sheet at all. The Share panel asks so it can
 * leave the "Share…" button out entirely rather than offering a button that
 * cannot do anything — Firefox desktop being the usual case.
 *
 * A plain function, not a hook: `navigator.share` cannot appear or disappear
 * part-way through a session, so there is nothing to subscribe to.
 */
export function canShare(): boolean {
  return defaultShare() !== undefined;
}

/**
 * Opens the OS share sheet on anything. The share function is injectable so this
 * is testable without a browser.
 *
 * IMPORTANT: `share()` is called before this function awaits anything. iOS only
 * permits the sheet from a live user gesture, and an `await` before the call
 * spends that gesture — the sheet then silently never appears. Keep it first,
 * and keep every caller synchronous up to here.
 */
export async function shareLink(
  payload: SharePayload,
  share = defaultShare()
): Promise<ShareOutcome> {
  if (!share) return 'unsupported';

  try {
    await share(payload);
    return 'shared';
  } catch (err) {
    // The spec rejects with AbortError when the user closes the sheet
    if (err instanceof Error && err.name === 'AbortError') return 'dismissed';
    return 'failed';
  }
}

/** The app itself, which is what the Share App panel sends. */
export async function shareApp(share = defaultShare()): Promise<ShareOutcome> {
  return shareLink(sharePayload(), share);
}

/**
 * One afternoon, rather than the app.
 *
 * A different title because targets like Mail use it as the subject, and
 * "Pickleball Round Robin Generator" is an odd thing to head a message that
 * means "watch our session".
 *
 * Scores are named only when the session keeps them. A link that promises
 * scores and then shows a schedule with no numbers on it reads as broken, and
 * the host who turned scoring off is the one person who knows it is not.
 */
export function sessionPayload(url: string, scoring: boolean): SharePayload {
  return {
    title: `Our Round Robin Schedule${scoring ? ' and Scores' : ''}`,
    text: `Tap the link to view our round robin schedule${scoring ? ' and scores' : ''}.`,
    url,
  };
}
