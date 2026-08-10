/**
 * Where the printer button goes on this device.
 *
 * `window.print()` is the whole answer nearly everywhere, including Android's
 * installed apps and a Safari tab on an iPhone. The exception is an iOS app
 * launched from the home screen: WebKit only ever hosted the print dialog in
 * Safari's own UI, so there the call returns cleanly and nothing happens. No
 * exception is thrown and no promise rejects, which means the app cannot notice
 * afterwards and has to decide in advance instead.
 *
 * What still works there is the OS share sheet, because it belongs to the
 * system rather than to the browser. Handed a PDF it offers Print, along with
 * Save to Files and Mail, so the schedule reaches paper by a different road.
 */
import type { ShareOutcome } from './share';

/**
 * - `dialog`  ask the browser to print, which is the normal path
 * - `share`   build a PDF and hand it to the OS
 * - `blocked` neither is available, so the only honest thing is to say so
 */
export type PrintRoute = 'dialog' | 'share' | 'blocked';

/**
 * Pure, so the matrix can be tested without a browser to pretend to be.
 *
 * Only iOS standalone is treated as special. An Android home-screen app prints
 * perfectly well, and routing it through a share sheet would be taking away a
 * working print dialog to solve someone else's problem.
 */
export function printRoute(input: {
  standalone: boolean;
  ios: boolean;
  canShareFiles: boolean;
}): PrintRoute {
  if (!input.standalone || !input.ios) return 'dialog';
  return input.canShareFiles ? 'share' : 'blocked';
}

/** Four bytes that are a PDF header and nothing else. */
const PROBE = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

/**
 * Whether this browser will accept a PDF through the share sheet.
 *
 * Asked with a stand-in file rather than the real schedule, because the answer
 * depends on the type and not on the contents. Building a whole document only
 * to find out it cannot go anywhere would be work done for nothing, and it has
 * to happen inside the tap.
 */
export function canSharePdf(nav: Navigator | undefined = globalThis.navigator): boolean {
  if (!nav?.share || !nav.canShare) return false;
  try {
    return nav.canShare({ files: [new File([PROBE], 'probe.pdf', { type: 'application/pdf' })] });
  } catch {
    // Older WebKit throws on a shape it does not recognise instead of saying no.
    return false;
  }
}

type ShareFn = (data: ShareData) => Promise<void>;

function defaultShare(): ShareFn | undefined {
  if (typeof navigator === 'undefined' || !navigator.share) return undefined;
  return navigator.share.bind(navigator);
}

/**
 * Opens the share sheet on a finished PDF.
 *
 * IMPORTANT: `share()` is called before this function awaits anything, for the
 * same reason `shareApp` is written that way. iOS only allows the sheet from a
 * live user gesture, and an `await` beforehand spends it, after which the sheet
 * silently never appears. That is also why the document is built synchronously
 * by the caller rather than awaited here.
 */
export async function sharePdf(
  file: File,
  title: string,
  share = defaultShare()
): Promise<ShareOutcome> {
  if (!share) return 'unsupported';

  try {
    await share({ files: [file], title });
    return 'shared';
  } catch (err) {
    // Backing out of the sheet is a normal answer, not a failure to report.
    if (err instanceof Error && err.name === 'AbortError') return 'dismissed';
    return 'failed';
  }
}
