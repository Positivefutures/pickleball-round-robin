import { DONATE_URL } from '../../lib/appInfo';
import { ExternalLinkIcon } from '../icons';

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
        className="mx-4 w-full max-w-md rounded-2xl border-2 border-[#B7DBB8] bg-[#FBFDFA] px-8 py-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Both illustrations ship opaque, so they only sit flush on a card
            background that matches the near-white they were exported against. */}
        <img
          src="/donate-top.png"
          alt=""
          width={335}
          height={181}
          className="mx-auto w-[125px]"
        />

        <h2 className="mt-1 text-center text-4xl font-extrabold tracking-tight text-[#032C26]">
          Donate
        </h2>

        <img
          src="/donate-separator.png"
          alt=""
          width={388}
          height={46}
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
          className="mt-4 flex items-center gap-3 rounded-xl border border-[#D8EBD4] bg-[#EFF7ED] p-3 transition-colors hover:bg-[#E4F2E0]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#CDE7C7] text-[#166534]">
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
            middle-click, and announces itself correctly to screen readers. */}
        <a
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-[#0A7A29] bg-gradient-to-b from-[#1AAA3A] to-[#0D8D31] px-4 py-3.5 text-lg font-bold text-white shadow-md transition-colors hover:from-[#149132] hover:to-[#0A7A29]"
        >
          <img src="/donate-cup.png" alt="" width={123} height={112} className="h-8 w-auto" />
          Open Ko-fi &rarr;
        </a>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl border border-[#CACBCF] bg-gradient-to-b from-[#F7F7F7] to-[#EFF0F0] px-4 py-3 text-lg font-medium text-gray-600 transition-colors hover:from-[#EDEEEE] hover:to-[#E5E6E6]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
