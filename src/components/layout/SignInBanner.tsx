interface Props {
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * The offer of an account, once there is something worth losing.
 *
 * Built to match InstallBanner beside it: in normal flow rather than an
 * overlay, so it sits above the page without dimming it, trapping focus or
 * needing the scroll lock. One line, one button, and a cross that means never
 * again on this device.
 *
 * It is the only part of accounts that a host who never signs in would see,
 * which is why it is gated hard in App and why it was held back until the
 * promise on it was true: the data really is kept, and it really does come back
 * on a new phone.
 */
export function SignInBanner({ onOpen, onDismiss }: Props) {
  return (
    <div className="no-print flex items-center gap-3 rounded-lg border border-brand-teal bg-brand-teal-light px-4 py-3">
      <p className="flex-1 text-sm text-gray-800">
        Your groups are on this phone only. A free account keeps them safe.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 whitespace-nowrap rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal-dark"
      >
        Sign in
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-brand-teal transition-colors hover:bg-white"
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
