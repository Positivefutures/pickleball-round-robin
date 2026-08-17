import type { RoundType } from '../../types';
import { ROUND_TYPES, pillMeta } from '../../lib/roundTypes';
import { CourtIcon } from '../icons';
import { PanelGlyph } from '../PanelGlyph';
import { panelCard } from '../panelStyles';
import { TypeGlyphs } from './typeGlyphs';

/** Normal first, the same order the picker offers them in. */
const FORMATS: (RoundType | null)[] = [null, ...ROUND_TYPES];

/**
 * What the round types are, and nothing else.
 *
 * This was the Special Game Types panel, where a host switched each type on and
 * gave it a frequency. Setting them moved out to the list on Setup, where the
 * host says which round is which by looking at the rounds; what is left here is
 * the half that was never a setting — the formats and what they mean, behind
 * the ⓘ beside the title.
 *
 * It was called Game Types until Jeff renamed it. Everything about the
 * feature is a property of a round, `RoundType` in the code included, so the
 * words the host reads say round now too.
 */
export function RoundTypesInfoPanel({ onClose }: { onClose: () => void }) {
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
          Round Types
        </h2>

        {/* Each format named by the pill it wears everywhere else, rather than
            by a heading of its own. The host meets these on a round card and in
            the picker; a panel that explains them under a different name in a
            different colour is explaining something they have not seen.

            Normal first, in the same order the picker offers them. It is what
            most of the afternoon is and what the other three are a change from,
            so a panel that only listed the three would be describing the
            exceptions and never the rule. */}
        {FORMATS.map((type) => {
          const pill = pillMeta(type);
          return (
            <section key={type ?? 'normal'} className="mt-6 border-t border-gray-200 pt-5">
              <h3
                className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-base font-bold ${pill.badgeClass} ${pill.badgeEdgeClass}`}
              >
                <TypeGlyphs type={type} size="picker" />
                {pill.badge}
              </h3>
              <p className="mt-2 text-sm font-medium text-gray-700">{pill.description}</p>
            </section>
          );
        })}

        {/* The one thing about round types a host cannot work out by looking at
            the schedule, and the only place the app says it.

            Rewritten when the feature stopped being called game types. Saying
            "round type" twice in one sentence reads worse than saying "game"
            twice did, so the second one is an "it". */}
        <div className="mt-6 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p>
            Special round types come first. A pair from Set Partners is split for that one round
            if they do not suit it, then they are back together.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-bold text-gray-700 transition-colors hover:bg-gray-300"
        >
          Done
        </button>
      </div>
    </div>
  );
}
