import { useStoredValue } from '../../hooks/useStoredValue';
import * as stores from '../../lib/stores';
import { APP_TITLE } from '../../lib/appInfo';

interface Props {
  onStartTutorial: () => void;
  onClose: () => void;
}

/**
 * The invitation a launch opens on: the logo, the name, and the offer of a
 * guided tour. App.tsx decides when it appears — at most once an hour, on the
 * Players tab, and never again once the tour is completed or the box below is
 * ticked.
 *
 * The image is the 512px home-screen icon rather than logo.png, which is 96px
 * and goes soft at this size. It lands in the runtime cache the first time this
 * renders, and a first render necessarily has a network.
 */
export function SplashScreen({ onStartTutorial, onClose }: Props) {
  const [dismissed, setDismissed] = useStoredValue(stores.tutorialDismissed);

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg border-[3px] border-[#444] shadow-lg p-6 mx-4 max-w-sm w-full text-center">
        <img
          src="/icon-512.png"
          alt=""
          width={512}
          height={512}
          className="mx-auto h-36 w-36 rounded-2xl"
        />
        <h2 className="mt-4 text-2xl font-bold" style={{ color: '#051829' }}>
          {APP_TITLE}
        </h2>
        <p className="mt-3 text-sm text-gray-600">
          New here? Take the tour. You will build a real schedule with a practice
          group, doing every step yourself. It takes about three minutes.
        </p>
        <div className="mt-5 space-y-3">
          <button
            onClick={onStartTutorial}
            className="w-full px-4 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-medium"
          >
            Start Tutorial
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            Skip Tutorial
          </button>
        </div>
        <label className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={dismissed}
            onChange={(e) => setDismissed(e.target.checked)}
            className="h-4 w-4 accent-brand-teal"
          />
          Don’t show at startup
        </label>
      </div>
    </div>
  );
}
