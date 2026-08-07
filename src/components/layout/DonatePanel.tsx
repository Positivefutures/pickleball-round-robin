import { DONATE_URL } from '../../lib/appInfo';

interface Props {
  onClose: () => void;
}

/** "https://ko-fi.com/pbroundrobin" -> "ko-fi.com/pbroundrobin" */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** Box with an arrow leaving it: the link opens away from the app. */
function LinkIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        fill="currentColor"
        d="m21.0035 10c.5523 0 1-.44772 1-1v-6c0-.55228-.4477-1-1-1h-6.0036c-.5523 0-1 .44771-1 1 0 .55228.4477 1 1 1h3.5896l-8.60667 8.6066c-.39052.3905-.39052 1.0237 0 1.4142.39057.3906 1.02367.3906 1.41417 0l8.6065-8.60643v3.58563c0 .55228.4477 1 1 1zm-16.0035-5c-1.65685 0-3 1.34315-3 3v11c0 1.6569 1.34315 3 3 3h11c1.6569 0 3-1.3431 3-3v-6c0-.5523-.4477-1-1-1s-1 .4477-1 1v6c0 .5523-.4477 1-1 1h-11c-.55228 0-1-.4477-1-1v-11c0-.55228.44772-1 1-1h6c.5523 0 1-.44772 1-1s-.4477-1-1-1z"
      />
    </svg>
  );
}

/** The Ko-fi mug: steam ticks, a cup with a handle, and a heart on the side. */
function CupIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M7 4.4 6.2 2.6M12 3.8V1.8M17 4.4l.8-1.8" />
      </g>
      <path
        fill="currentColor"
        d="M4 8.2h13a1 1 0 0 1 1 1v5.3a5.5 5.5 0 0 1-5.5 5.5h-4A5.5 5.5 0 0 1 3 14.5V9.2a1 1 0 0 1 1-1Z"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.6"
        d="M18.4 10.2h1.1a2.4 2.4 0 0 1 0 4.8h-1.1"
      />
      {/* Knocked out of the mug, so the heart reads as the button's green */}
      <path
        fill="#0D8D31"
        d="M10.5 17.4c-.2 0-.4-.06-.55-.2l-2.5-2.3a2.2 2.2 0 0 1 3.05-3.15 2.2 2.2 0 0 1 3.05 3.15l-2.5 2.3a.8.8 0 0 1-.55.2Z"
      />
    </svg>
  );
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
            <LinkIcon />
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
          <CupIcon />
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
