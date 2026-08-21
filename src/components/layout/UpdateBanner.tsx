import { NewVersionIcon } from '../icons';
import { bannerOrange, bannerOrangeEdge, bannerOrangeHover } from './bannerStyles';

interface Props {
  onReload: () => void;
  onDismiss: () => void;
}

/**
 * Shown when a new build has downloaded and is waiting to be let in.
 *
 * Orange, from `INBOX/New Version.png`. It used to be slate and it read as
 * housekeeping, which is not what this is: a fix somebody asked for is sitting
 * behind it. The install banner is now painted from the same three strings in
 * bannerStyles, so this is the shape both of them keep.
 *
 * Dismissing it does not refuse the update, only the interruption: it comes
 * back the next time the app is picked up. That matters more than it used to.
 * A waiting build was once let in on its own after a real absence, and is not
 * any more — Reload is the only way through — so the cross has to be a "not
 * now" rather than an answer, or one tap would leave somebody on an old build
 * with nothing left to ask them.
 */
export function UpdateBanner({ onReload, onDismiss }: Props) {
  return (
    <div
      role="status"
      className={`no-print flex items-center gap-3 px-4 py-3 ${bannerOrangeEdge}`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${bannerOrange}`}
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
        className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-bold text-white transition-colors ${bannerOrange}`}
      >
        Reload
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not now"
        className={`shrink-0 rounded p-1 text-slate-500 transition-colors ${bannerOrangeHover}`}
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
