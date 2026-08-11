import type { ReactNode } from 'react';
import { installRoute, isIos } from '../../lib/install';

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

// The three dots every non-Safari browser keeps its own menu behind.
function MoreGlyph() {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="currentColor"
      aria-hidden="true" className="inline-block shrink-0 align-text-bottom text-gray-700"
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/**
 * The app as it will look on a home screen: the logo on a white tile with iOS
 * corners, which is exactly what the manifest icon produces.
 *
 * Composed here rather than shipped as another PNG, so it stays sharp on any
 * screen and there is only ever one logo file to change. The tile is white and
 * so is the panel, so it carries both a hairline and a shadow — either alone
 * leaves an edge that some screens lose. The radius is 22% of the width, the
 * proportion iOS rounds an icon by, so it reads as an app icon and not a photo.
 *
 * Decorative: alt is empty because the heading above already says what this is,
 * and the steps below are the part worth reading out.
 */
function AppIconTile() {
  return (
    <div className="mb-3 flex justify-center">
      <div className="rounded-[14px] border border-gray-200 bg-white p-1.5 shadow-md">
        <img src="/logo.png" alt="" width={52} height={52} className="h-13 w-13" />
      </div>
    </div>
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

/**
 * Points at the Share button in Safari's toolbar, which is the one thing the
 * written steps cannot do: the button is outside the page, so nothing in here
 * can highlight it.
 *
 * Only on an iPhone. iPad Safari puts Share in the top right, so the same arrow
 * there would be pointing at nothing. The width test is the check, because a
 * phone held in landscape is still a phone.
 */
function ShareArrow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 hidden justify-center pb-2 max-[520px]:flex"
    >
      <div className="flex flex-col items-center gap-1 motion-safe:animate-bounce">
        <span className="rounded-full bg-white/95 px-3 py-1 text-sm font-semibold text-gray-800 shadow-lg">
          Share is down here
        </span>
        <svg
          width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
        >
          <line x1="12" y1="3" x2="12" y2="20" />
          <polyline points="5 13 12 20 19 13" />
        </svg>
      </div>
    </div>
  );
}

export function InstallPanel({ canPrompt, onInstall, onClose }: Props) {
  const route = installRoute({ canPrompt });
  // The arrow belongs to Safari's toolbar, so it follows the share-sheet steps
  // rather than the panel being open on any iOS browser.
  const showArrow = route === 'ios' && isIos();

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-lg border-[3px] border-[#444] bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <AppIconTile />
        <h2 className="text-center text-[1.35rem] font-extrabold text-[#222]">
          Add to Home Screen
        </h2>
        <p className="mt-2 text-gray-600">
          Keep the app one tap away, and it opens full screen without the browser bars.
        </p>

        {route === 'native' && (
          <button
            type="button"
            onClick={onInstall}
            className="mt-5 w-full rounded-md bg-brand-teal px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-teal-dark"
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

        {/* Chrome, Firefox and Edge on iOS are Safari underneath and get no
            install prompt either, but each keeps its own Add to Home Screen
            inside its own menu. Sending them to Safari's toolbar would be a
            wrong instruction rather than a vague one. */}
        {route === 'ios-other' && (
          <>
            <ol className="mt-5 space-y-3">
              <Step n={1}>
                Open your browser&rsquo;s menu <MoreGlyph />.
              </Step>
              <Step n={2}>
                Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>{' '}
                <AddToHomeGlyph />.
              </Step>
            </ol>
            <p className="mt-4 text-sm text-gray-500">
              Not finding it? Safari always has it, and the steps there are the same.
            </p>
          </>
        )}

        {route === 'manual' && (
          <ol className="mt-5 space-y-3">
            <Step n={1}>Open your browser&rsquo;s menu <MoreGlyph />.</Step>
            <Step n={2}>
              Choose <strong>Install</strong> or <strong>Add to Home Screen</strong>.
              Safari keeps it under the Share button <IosShareGlyph />.
            </Step>
          </ol>
        )}

        {/* The screenshot is of Safari's share sheet, so it only helps the one
            route that is looking at Safari's share sheet. Under the native
            Install button, or beside another browser's own menu, it misleads. */}
        {route === 'ios' && (
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
          className="mt-4 w-full rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
        >
          Close
        </button>
      </div>

      {showArrow && <ShareArrow />}
    </div>
  );
}
