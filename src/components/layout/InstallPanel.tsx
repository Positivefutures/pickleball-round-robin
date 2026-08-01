import type { ReactNode } from 'react';
import { installRoute } from '../../lib/install';

interface Props {
  canPrompt: boolean;
  onInstall: () => void;
  onClose: () => void;
}

// iOS Share: a box with an arrow leaving the top.
function IosShareGlyph() {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className="inline-block shrink-0 align-text-bottom text-blue-600"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

// iOS "Add to Home Screen": a plus inside a rounded square.
function AddToHomeGlyph() {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className="inline-block shrink-0 align-text-bottom text-gray-700"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700">
        {n}
      </span>
      <span className="text-gray-600">{children}</span>
    </li>
  );
}

export function InstallPanel({ canPrompt, onInstall, onClose }: Props) {
  const route = installRoute({ canPrompt });

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-lg font-semibold text-gray-800">
          Add to Home Screen
        </h2>
        <p className="mt-2 text-gray-600">
          Keep the app one tap away, and it opens full screen without the browser bars.
        </p>

        {route === 'native' && (
          <button
            type="button"
            onClick={onInstall}
            className="mt-5 w-full rounded-md bg-green-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-700"
          >
            Install
          </button>
        )}

        {route === 'ios' && (
          <ol className="mt-5 space-y-3">
            <Step n={1}>
              Tap the <strong>Share</strong> button <IosShareGlyph /> at the bottom of the
              screen.
            </Step>
            <Step n={2}>
              Scroll down and tap <strong>Add to Home Screen</strong> <AddToHomeGlyph />.
            </Step>
            <Step n={3}>
              Tap <strong>Add</strong>, top right.
            </Step>
          </ol>
        )}

        {route === 'manual' && (
          <ol className="mt-5 space-y-3">
            <Step n={1}>Open your browser&rsquo;s menu.</Step>
            <Step n={2}>
              Choose <IosShareGlyph /> <strong>Share</strong>, <strong>Install</strong>, or{' '}
              <strong>Add to Home Screen</strong> — Safari keeps it under the Share button.
            </Step>
          </ol>
        )}

        {/* Shown only alongside written steps. Under the native Install button an
            iOS share-sheet screenshot would just be confusing. */}
        {route !== 'native' && (
          <img
            src="/share.png"
            alt="The iOS share sheet, with Add to Home Screen highlighted"
            width={700}
            height={637}
            className="mt-5 w-full rounded-md border border-gray-200"
          />
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}
