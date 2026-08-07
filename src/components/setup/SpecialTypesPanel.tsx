import type { RoundType, SpecialGameTypes, SpecialTypeSetting } from '../../types';
import {
  MAX_FREQUENCY, ROUND_TYPES, ROUND_TYPE_META, minFrequency,
} from '../../lib/roundTypes';

interface Props {
  specialTypes: SpecialGameTypes;
  onChange: (type: RoundType, patch: Partial<SpecialTypeSetting>) => void;
  onClose: () => void;
}

export function SpecialTypesPanel({ specialTypes, onChange, onClose }: Props) {
  // Two types cannot both play every round, so the shortest gap any of them can
  // have is however many are switched on.
  const min = minFrequency(specialTypes);
  const options = Array.from(
    { length: MAX_FREQUENCY - min + 1 }, (_, i) => min + i
  );

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-lg font-semibold text-gray-800">
          Special Game Types
        </h2>

        {ROUND_TYPES.map((type) => {
          const meta = ROUND_TYPE_META[type];
          const setting = specialTypes[type];
          return (
            <section key={type} className="mt-6 border-t border-gray-200 pt-5">
              <h3 className="text-lg font-semibold text-gray-800">{meta.title}</h3>
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
                      {options.map((n) => (
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

        <p className="mt-6 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Special game types come first. A pair from Set Partners is split for that round only if
          they do not suit the game type, then they are back together next round.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
        >
          Done
        </button>
      </div>
    </div>
  );
}
