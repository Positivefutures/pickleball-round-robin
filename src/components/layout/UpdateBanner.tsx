import { NewVersionIcon } from '../icons';

interface Props {
  onReload: () => void;
  onDismiss: () => void;
}

/** The orange Jeff drew the banner in. Tile and button share it. */
const ORANGE = 'bg-[#FA5D02] hover:bg-[#DE5202]';

/**
 * Shown when a new build has downloaded and is waiting to be let in.
 *
 * Orange, from `INBOX/New Version.png`. It used to be slate and it read as
 * housekeeping, which is not what this is: a fix somebody asked for is sitting
 * behind it. Green stays with the install banner, so the two never look alike.
 *
 * Dismissing it does not refuse the update, only the interruption. A build that
 * is waiting is let in on its own the next time somebody comes back to the app
 * after a minute away, so the choice here is when, not whether.
 */
export function UpdateBanner({ onReload, onDismiss }: Props) {
  return (
    <div
      role="status"
      className="no-print flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3"
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${ORANGE}`}
      >
        <NewVersionIcon className="h-6 w-6 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-slate-900">New version ready</p>
        <p className="text-sm text-slate-700">Reload to get the latest improvements.</p>
      </div>
      <button
        type="button"
        onClick={onReload}
        className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-bold text-white transition-colors ${ORANGE}`}
      >
        Reload
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not now"
        className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-orange-100"
      >
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none"
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
