import { ShieldCheckIcon } from '../icons';

interface Props {
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * The offer of an account, once there is something worth losing.
 *
 * Built on UpdateBanner, like InstallBanner beside it: icon, the offer in bold,
 * what it buys under it, then the button. Teal rather than orange, so it is
 * told apart from the two orange bars before a word of it is read. The shield
 * is the promise the second line makes, and it is the same shield the account
 * panel uses for the same promise.
 *
 * It used to lead with the risk — "Your groups are only on this phone." — and
 * it now leads with the offer. It also waits longer: not for any four players,
 * but for a group the host made themselves, holding four. See offerSignIn in
 * App. Jeff's call on 2026-08-21.
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
    <div className="no-print relative rounded-lg border border-brand-teal bg-brand-teal-light px-4 py-3">
      {/* Icon, words, cross — the row the other two banners are, minus the
          button. The second line here is a sentence rather than the half line
          its neighbours carry, and left in the middle of that row it had a
          column about 140px wide to say it in. */}
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal">
          <ShieldCheckIcon className="h-6 w-6 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          {/* Held clear of the cross, which is out of the flow above it. Four
              words now, so it runs on one line at every width the app supports
              and the pr-8 is all the clearance it needs. */}
          <p className="pr-8 text-base font-bold text-slate-900">
            Create a free account
          </p>
          <p className="mt-0.5 text-sm text-slate-700">
            This keeps your data safe, synced, and enables features such as sharing your
            round robin schedule with your members.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 rounded p-1 text-slate-500 transition-colors hover:bg-white"
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

      {/* Under the words rather than beside them, and hard right, which is
          where it sat on the old one line version and where the eye is already
          looking by the end of the sentence. */}
      <button
        type="button"
        onClick={onOpen}
        className="ml-auto mt-2 block whitespace-nowrap rounded-md bg-brand-teal px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-teal-dark"
      >
        Create Free Account
      </button>
    </div>
  );
}
