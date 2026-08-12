import type { ReactElement } from 'react';
import type { RoundType, SpecialGameTypes, SpecialTypeSetting } from '../../types';
import { MAX_FREQUENCY, ROUND_TYPE_META, orderedTypes } from '../../lib/roundTypes';
import {
  CourtIcon,
  EqualSkillIcon,
  MenGamesIcon,
  MixedGamesIcon,
  WomenGamesIcon,
} from '../icons';
import { PanelGlyph } from '../PanelGlyph';
import { Toggle } from '../Toggle';

interface Props {
  specialTypes: SpecialGameTypes;
  onChange: (type: RoundType, patch: Partial<SpecialTypeSetting>) => void;
  onMove: (type: RoundType, direction: -1 | 1) => void;
  onClose: () => void;
}

const FREQUENCIES = Array.from({ length: MAX_FREQUENCY }, (_, i) => i + 1);

// Arrows rather than a drag handle: iOS Safari has no HTML5 drag-and-drop, and
// this app is mostly used on a phone at the side of a court.
function MoveButton({
  label, disabled, onClick, children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="min-h-8 min-w-8 rounded-md border border-[#999] bg-gray-100 text-sm font-bold text-gray-600 transition-colors hover:border border-[#999] bg-gray-200 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * Artwork Jeff has supplied so far. A type with no entry simply shows no icon.
 * Gendered takes two, because the format is men playing men and women playing
 * women, and one symbol can only say half of that.
 *
 * Each carries its own size, because the drawings do not fill their boxes
 * equally: the two gendered symbols reach the edges, the mixed one fills 77%
 * of its height and the balance 96%. At one box size the mixed one read as the
 * small icon on the panel. These three numbers put the same amount of ink on
 * the page, which is what the eye is comparing.
 */
const TYPE_ICONS: Record<
  RoundType,
  { Icon: (p: { className?: string }) => ReactElement; size: string }[]
> = {
  gendered: [
    { Icon: MenGamesIcon, size: 'w-[26px] h-[26px]' },
    { Icon: WomenGamesIcon, size: 'w-[26px] h-[26px]' },
  ],
  mixed: [{ Icon: MixedGamesIcon, size: 'w-[34px] h-[34px]' }],
  skill: [{ Icon: EqualSkillIcon, size: 'w-[27px] h-[27px]' }],
};

export function SpecialTypesPanel({ specialTypes, onChange, onMove, onClose }: Props) {
  const ordered = orderedTypes(specialTypes);

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-lg border-[3px] border-[#444] bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* On its side. Everywhere else in the app a court is drawn end on,
            the way a player stands in it; here it is the whole court seen from
            the side of the net, which is how a host looking at a session sees
            one. Same artwork, turned, rather than a second drawing to keep. */}
        <PanelGlyph icon={CourtIcon} className="rotate-90" />
        <h2 className="text-center text-[1.35rem] font-extrabold text-[#222]">
          Special Game Types
        </h2>

        {ordered.map((type, i) => {
          const meta = ROUND_TYPE_META[type];
          const setting = specialTypes[type];
          return (
            <section key={type} className="mt-6 border-t border-gray-200 pt-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
                  {meta.title}
                  <span className="flex shrink-0 items-center gap-1">
                    {TYPE_ICONS[type].map(({ Icon, size }, n) => (
                      <Icon key={n} className={`${size} text-[#60697c]`} />
                    ))}
                  </span>
                </h3>
                <div className="flex shrink-0 gap-1">
                  <MoveButton
                    label={`Move ${meta.title} up`}
                    disabled={i === 0}
                    onClick={() => onMove(type, -1)}
                  >
                    &uarr;
                  </MoveButton>
                  <MoveButton
                    label={`Move ${meta.title} down`}
                    disabled={i === ordered.length - 1}
                    onClick={() => onMove(type, 1)}
                  >
                    &darr;
                  </MoveButton>
                </div>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-700">{meta.description}</p>

              {/* One switch rather than a Yes and a No. Two radios asked the
                  same question twice and took three times the width, and this is
                  the control Keep Score already taught. */}
              <div className="mt-2 flex items-center gap-3">
                <Toggle
                  checked={setting.enabled}
                  onChange={(on) => onChange(type, { enabled: on })}
                  label={`Play ${meta.title}`}
                />
                {setting.enabled && (
                  <div className="ml-2 flex items-center gap-1.5">
                    <span className="text-sm text-gray-700">Every</span>
                    <select
                      value={setting.frequency}
                      aria-label={`How often to play ${meta.title}`}
                      onChange={(e) => onChange(type, { frequency: parseInt(e.target.value) })}
                      className="min-w-14 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-teal"
                    >
                      {FREQUENCIES.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <span className="text-sm text-gray-700">
                      {setting.frequency === 1 ? 'Round' : 'Rounds'}
                    </span>
                  </div>
                )}
              </div>
            </section>
          );
        })}

        <div className="mt-6 space-y-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p>
            Every type you switch on starts at round 1. When two of them want the same round, the
            rarer one goes first and your order settles a tie.
          </p>
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
