import { ShieldCheckIcon } from '../icons';

interface Props {
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * The offer of an account, once there is something worth losing.
 *
 * Built on UpdateBanner, like InstallBanner beside it: icon, the risk in bold,
 * the answer under it, then the button. Teal rather than orange or green, so
 * the three bars are told apart before a word of any of them is read. The
 * shield is the promise the second line makes, and it is the same shield the
 * account panel uses for the same promise.
 *
 * In normal flow rather than an overlay, so it sits above the page without
 * dimming it, trapping focus or needing the scroll lock. One ask, one button,
 * and a cross that means never again on this device.
 *
 * It is the only part of accounts that a host who never signs in would see,
 * which is why it is gated hard in App and why it was held back until the
 * promise on it was true: the data really is kept, and it really does come back
 * on a new phone.
 */
export function SignInBanner({ onOpen, onDismiss }: Props) {
  return (
    <div className="no-print flex items-center gap-3 rounded-lg border border-brand-teal bg-brand-teal-light px-4 py-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal">
        <ShieldCheckIcon className="h-6 w-6 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-slate-900">Your groups are on this phone only.</p>
        <p className="text-sm text-slate-700">A free account keeps them safe.</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 whitespace-nowrap rounded-md bg-brand-teal px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-dark"
      >
        Sign in
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-white"
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
