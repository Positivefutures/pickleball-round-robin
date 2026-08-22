import { WarningIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';

interface Props {
  /** The round already holding the one Round Timer the app allows at a time. */
  roundNumber: number;
  onClose: () => void;
}

/**
 * What tapping a second round's timer icon sees, instead of starting a second
 * timer. Only one runs across the whole app — see openRoundTimer() in
 * lib/roundTimer.ts, the single gate every timer icon's click goes through.
 *
 * Reset, not Pause, because Reset is what the gate actually waits for: the
 * round holding the timer lets go of it when its phase is idle, and pausing
 * leaves it paused. It also has to name a button that is on the sheet, and
 * the middle one says Pause now.
 */
export function TimerBlockedDialog({ roundNumber, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={`bg-white ${panelCard} p-6 mx-4 max-w-sm w-full`}>
        <PanelHeading icon={WarningIcon} title={`Reset Round ${roundNumber}’s Timer First`} />
        <p className="mt-2 mb-4 text-sm text-gray-600 text-center">
          Only one Round Timer can run at a time. Reset Round {roundNumber}’s timer before
          starting this one.
        </p>
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 border border-[#999] bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-bold"
        >
          OK
        </button>
      </div>
    </div>
  );
}
