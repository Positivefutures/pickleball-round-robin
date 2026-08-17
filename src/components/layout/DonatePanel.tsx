import { DONATE_URL } from '../../lib/appInfo';
import { ExternalLinkIcon } from '../icons';
import { panelCard } from '../panelStyles';

interface Props {
  onClose: () => void;
}

/** "https://ko-fi.com/pbroundrobin" -> "ko-fi.com/pbroundrobin" */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function DonatePanel({ onClose }: Props) {
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={`mx-4 w-full max-w-md ${panelCard} bg-[#FEFEFE] px-8 py-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Both illustrations ship opaque, so they only sit flush on a card
            background that matches the near-white they were exported against.
            That near-white is #FEFEFE, the same one the account and share cards
            use, and it is why this card is no longer the faint green it was. */}
        <img
          src="/donate-top.png"
          alt=""
          width={335}
          height={181}
          className="mx-auto w-[125px]"
        />

        <h2 className="mt-1 text-center text-4xl font-extrabold tracking-tight text-[#111F1F]">
          Donate
        </h2>

        <img
          src="/donate-separator.png"
          alt=""
          width={388}
          height={35}
          className="mx-auto mt-2 w-[160px]"
        />

        <p className="mt-3 text-center text-lg leading-snug text-gray-700">
          This app is free, has no ads, and never tracks you or your players. If it&rsquo;s
          made running your round robins easier, a small tip keeps it going.
        </p>

        {/* The same destination as the button below, so the panel showing the
            address is also the address you can tap. */}
        <a
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-3 rounded-xl border border-[#A6D1D5] bg-brand-teal-light p-3 transition-colors hover:bg-[#D5F0F2]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#C2E6E9] text-brand-teal">
            <ExternalLinkIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] leading-snug text-gray-600">
              Handled by Ko-fi — no account needed. Opens in a new tab:
            </span>
            <span className="block break-all text-[13px] leading-snug font-semibold text-gray-800">
              {displayUrl(DONATE_URL)}
            </span>
          </span>
        </a>

        {/* An anchor rather than window.open: survives popup blockers, supports
            middle-click, and announces itself correctly to screen readers.

            Flat teal, where it used to be a green gradient with its own darker
            edge. The gradient was the last button in the app still lit from
            above, and beside a panel of flat fills it read as a different app's
            button that had wandered in. */}
        <a
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl bg-brand-teal px-4 py-3.5 text-lg font-bold text-white shadow-md transition-colors hover:bg-brand-teal-dark"
        >
          {/* Cut out of `INBOX/NEW`'s cup, which arrived with a checkerboard
              baked in where its transparency should have been. It has to be
              transparent: it sits on teal here and on nothing else anywhere. */}
          <img src="/donate-cup.png" alt="" width={180} height={163} className="h-9 w-auto" />
          Open Ko-fi &rarr;
        </a>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl border border-panel-edge bg-[#F7F7F8] px-4 py-3 text-lg font-bold text-[#3A4353] transition-colors hover:bg-[#EDF0F4]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
