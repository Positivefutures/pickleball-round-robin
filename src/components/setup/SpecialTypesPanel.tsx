import type { RoundType, SpecialGameTypes, SpecialTypeSetting } from '../../types';
import { MAX_FREQUENCY, ROUND_TYPE_META, orderedTypes } from '../../lib/roundTypes';
import { MixedGamesIcon } from '../icons';

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

// Artwork Jeff has supplied so far. A type with no entry simply shows no icon.
const TYPE_ICONS: Partial<Record<RoundType, true>> = { mixed: true };

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
                  {TYPE_ICONS[type] && (
                    <MixedGamesIcon className="w-[26px] h-[26px] text-[#60697c]" />
                  )}
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

              <div className="mt-2 flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1">
                  <input
                    type="radio"
                    name={`special-${type}`}
                    checked={!setting.enabled}
                    onChange={() => onChange(type, { enabled: false })}
                    className="text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">No</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1">
                  <input
                    type="radio"
                    name={`special-${type}`}
                    checked={setting.enabled}
                    onChange={() => onChange(type, { enabled: true })}
                    className="text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">Yes</span>
                </label>
                {setting.enabled && (
                  <div className="ml-2 flex items-center gap-1.5">
                    <span className="text-sm text-gray-700">Every</span>
                    <select
                      value={setting.frequency}
                      aria-label={`How often to play ${meta.title}`}
                      onChange={(e) => onChange(type, { frequency: parseInt(e.target.value) })}
                      className="min-w-14 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
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
