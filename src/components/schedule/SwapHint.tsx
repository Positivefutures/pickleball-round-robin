import { TipIcon } from '../icons';

interface Props {
  onDismiss: () => void;
}

/**
 * How to swap two players, said once.
 *
 * It used to be a grey line at the top of the schedule that could not be got
 * rid of, on every session forever. It is worth saying to somebody meeting the
 * app for the first time and worth nothing to anybody else, so it is now the
 * same green banner the install offer uses, with the same way out. Closing it
 * is remembered, and it does not come back.
 *
 * The bulb and the text are both a step up from the courts below, because this
 * is read once at a glance and then never again, while a name on a court is
 * read all afternoon.
 */
export function SwapHint({ onDismiss }: Props) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
    >
      <TipIcon className="w-[42px] h-[42px] text-green-700" />
      <p className="flex-1 text-base text-green-900">
        Tap a player, then tap another to swap them.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-green-700 transition-colors hover:bg-green-100"
      >
        <svg
          width="27" height="27" viewBox="0 0 24 24" fill="none"
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
