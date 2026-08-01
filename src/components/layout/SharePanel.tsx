import { useState } from 'react';
import { APP_URL } from '../../lib/appInfo';

interface Props {
  onClose: () => void;
}

/**
 * Shown only when the browser has no share sheet (Firefox desktop, mainly) or
 * the sheet errored — everywhere else Share App goes straight to the OS sheet.
 */
export function SharePanel({ onClose }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the link is on screen and selectable by hand
      setCopied(false);
    }
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-lg font-semibold text-gray-800">Share App</h2>
        <p className="mt-3 text-gray-600">
          Send this to anyone who runs a round robin.
        </p>

        {/* select-all: one tap or click selects the whole address */}
        <p className="mt-4 select-all break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
          {APP_URL}
        </p>

        <button
          type="button"
          onClick={handleCopy}
          className="mt-4 w-full rounded-md bg-green-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-700"
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-md bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}
