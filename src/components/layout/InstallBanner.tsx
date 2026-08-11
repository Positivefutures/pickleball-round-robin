interface Props {
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * In normal flow rather than an overlay: it should sit above the page content
 * without dimming it, trapping focus, or needing the scroll lock.
 */
export function InstallBanner({ onOpen, onDismiss }: Props) {
  return (
    <div className="no-print flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
      <p className="flex-1 text-sm text-green-900">
        Keep this on your home screen — one tap, no browser bars.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 whitespace-nowrap rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal-dark"
      >
        Show me
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-green-700 transition-colors hover:bg-green-100"
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
