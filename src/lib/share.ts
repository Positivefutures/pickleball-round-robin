import { APP_URL } from './appInfo';

export const SHARE_TITLE = 'Pickleball Round Robin Generator';

/**
 * No `text` field on purpose. Share targets append it to the url, so anything
 * here rides along in the message body — the share should be the link alone.
 * `title` is metadata: targets like Mail use it as the subject, and the ones
 * that send a plain message (Messages, WhatsApp) ignore it.
 */
export interface SharePayload {
  title: string;
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
 */
export function sessionPayload(url: string): SharePayload {
  return { title: 'Pickleball Round Robin', url };
}
