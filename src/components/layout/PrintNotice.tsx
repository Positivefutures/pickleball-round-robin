import { APP_URL } from '../../lib/appInfo';

export type PrintProblem = 'blocked' | 'failed';

interface Props {
  reason: PrintProblem;
  onDismiss: () => void;
}

/** Written out of APP_URL so the address here cannot drift from the real one. */
const HOST = new URL(APP_URL).host;

/**
 * Shown when the printer button could not do what it says.
 *
 * There is only one cause worth naming. An iOS app launched from the home
 * screen has no print dialog available to it, and on an older iPhone it has no
 * share sheet for files either, which leaves Safari as the single way through.
 * Saying that plainly beats a button that appears to do nothing, which is what
 * this replaces.
 *
 * Amber rather than red. Nothing has broken and no data is at risk; a job just
 * needs doing somewhere else.
 */
export function PrintNotice({ reason, onDismiss }: Props) {
  const message =
    reason === 'blocked'
      ? `This device cannot print from the home screen app. Open ${HOST} in Safari instead.`
      : 'The share sheet did not open. Try again, or use Safari to print.';

  return (
    <div
      role="alert"
      className="no-print flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <p className="flex-1 text-sm text-amber-900">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-amber-700 transition-colors hover:bg-amber-100"
      >
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}
