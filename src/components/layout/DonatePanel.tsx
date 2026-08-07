import { DONATE_URL } from '../../lib/appInfo';

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
        className="mx-4 w-full max-w-sm rounded-lg border-[3px] border-[#444] bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-[1.35rem] font-extrabold text-[#222]">Donate</h2>

        <p className="mt-3 text-gray-600">
          This app is free, has no ads, and never tracks you or your players. If it&rsquo;s
          made running your round robins easier, a small tip keeps it going.
        </p>

        <p className="mt-4 text-sm text-gray-500">
          Handled by Ko-fi — no account needed. Opens in a new tab:
        </p>
        <p className="mt-0.5 break-all text-sm font-medium text-gray-700">
          {displayUrl(DONATE_URL)}
        </p>

        {/* An anchor rather than window.open: survives popup blockers, supports
            middle-click, and announces itself correctly to screen readers. */}
        <a
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 block w-full rounded-md bg-green-600 px-4 py-2.5 text-center font-medium text-white transition-colors hover:bg-green-700"
        >
          Open Ko-fi &rarr;
        </a>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}
