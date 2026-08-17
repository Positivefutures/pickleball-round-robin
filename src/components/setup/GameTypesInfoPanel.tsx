import { ROUND_TYPES, ROUND_TYPE_META } from '../../lib/roundTypes';
import { CourtIcon } from '../icons';
import { PanelGlyph } from '../PanelGlyph';
import { panelCard } from '../panelStyles';
import { TypeGlyphs } from './typeGlyphs';

/**
 * What the three game types are, and nothing else.
 *
 * This was the Special Game Types panel, where a host switched each type on and
 * gave it a frequency. Setting them moved out to the list on Setup, where the
 * host says which round is which by looking at the rounds; what is left here is
 * the half that was never a setting — three formats and what they mean, behind
 * the ⓘ beside the title.
 */
export function GameTypesInfoPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={`mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain ${panelCard} bg-white p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* On its side. Everywhere else in the app a court is drawn end on,
            the way a player stands in it; here it is the whole court seen from
            the side of the net, which is how a host looking at a session sees
            one. Same artwork, turned, rather than a second drawing to keep. */}
        <PanelGlyph icon={CourtIcon} className="rotate-90" />
        <h2 className="text-center text-[1.35rem] font-extrabold text-[#222]">
          Game Types
        </h2>

        {ROUND_TYPES.map((type) => {
          const meta = ROUND_TYPE_META[type];
          return (
            <section key={type} className="mt-6 border-t border-gray-200 pt-5">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
                {meta.title}
                <span className="flex shrink-0 items-center gap-1">
                  <TypeGlyphs type={type} size="panel" className="text-[#60697c]" />
                </span>
              </h3>
              <p className="mt-1 text-sm font-medium text-gray-700">{meta.description}</p>
            </section>
          );
        })}

        {/* The one thing about game types a host cannot work out by looking at
            the schedule, and the only place the app says it. */}
        <div className="mt-6 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p>
            Special game types come first. A pair from Set Partners is split for that round only if
            they do not suit the game type, then they are back together next round.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
        >
          Done
        </button>
      </div>
    </div>
  );
}
