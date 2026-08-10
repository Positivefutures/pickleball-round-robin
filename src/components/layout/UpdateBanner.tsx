interface Props {
  onReload: () => void;
  onDismiss: () => void;
}

/**
 * Shown when a new build has downloaded and is waiting to be let in.
 *
 * Slate rather than green, which the install banner already owns. This one is
 * housekeeping and should read quieter than an invitation.
 *
 * Dismissing it does not refuse the update, only the interruption. The waiting
 * worker takes over on its own the next time the app is opened cold, so the
 * choice here is when, not whether.
 */
export function UpdateBanner({ onReload, onDismiss }: Props) {
  return (
    <div
      role="status"
      className="no-print flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
    >
      <p className="flex-1 text-sm text-slate-700">A new version is ready. Reload to get it.</p>
      <button
        type="button"
        onClick={onReload}
        className="shrink-0 whitespace-nowrap rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not now"
        className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-slate-200"
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
