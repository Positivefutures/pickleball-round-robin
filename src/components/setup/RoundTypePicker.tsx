import type { RoundType } from '../../types';
import { ROUND_TYPES, pillMeta } from '../../lib/roundTypes';
import { panelCard } from '../panelStyles';
import { TypeGlyphs } from './typeGlyphs';

/** Normal first: it is the one most rounds are, and the one to put back. */
const CHOICES: (RoundType | null)[] = [null, ...ROUND_TYPES];

interface Props {
  roundNumber: number;
  current: RoundType | null;
  onPick: (type: RoundType | null) => void;
  onClose: () => void;
}

/**
 * What one round is played as, in four taps' worth of choice.
 *
 * Deliberately not a menu of settings: there is no "every N rounds" in here and
 * no way to reach another round from it. One round, one answer, closed. The
 * host who wants four gendered rounds taps four rows, which is four taps
 * against a rule they then have to hold in their head.
 *
 * No portal. It sits where the old Round Types panel sat, which already clears
 * `.app-panel`'s z-10.
 */
export function RoundTypePicker({ roundNumber, current, onPick, onClose }: Props) {
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Round type for Round ${roundNumber}`}
        className={`mx-4 max-h-[90vh] w-full max-w-xs overflow-y-auto overscroll-contain ${panelCard} bg-white p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-lg font-extrabold text-[#222]">
          Round {roundNumber}
        </h2>

        <div className="mt-4 space-y-2.5">
          {CHOICES.map((type) => {
            const meta = pillMeta(type);
            const chosen = type === current;
            return (
              <button
                key={type ?? 'normal'}
                type="button"
                // aria-current rather than aria-pressed: these are four
                // alternatives with one in force, not four switches.
                aria-current={chosen ? 'true' : undefined}
                onClick={() => onPick(type)}
                className={`flex w-full items-center justify-center gap-2 rounded-full border-2 px-4 py-3 text-base font-bold transition-transform active:scale-[0.98] ${meta.badgeClass} ${meta.badgeEdgeClass} ${chosen ? 'ring-2 ring-brand-teal ring-offset-2' : ''}`}
              >
                <TypeGlyphs type={type} size="picker" />
                {meta.badge}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-[#999] bg-gray-100 px-4 py-2.5 font-bold text-gray-700 transition-colors hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
