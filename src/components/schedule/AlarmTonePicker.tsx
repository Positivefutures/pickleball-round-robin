import { useState } from 'react';
import { ALARM_TONES, previewTone, type AlarmToneId } from '../../lib/alarmSounds';
import { CheckIcon, ChevronDownIcon } from '../icons';
import { VolumeUpIcon } from './timerIcons';

interface Props {
  value: AlarmToneId;
  onChange: (id: AlarmToneId) => void;
}

/**
 * Choosing which of the five tones plays when time is up.
 *
 * A native `<select>` hands the list to the OS, which is the browser's own
 * grey menu rather than this app's — the same reason `GroupPicker` draws its
 * own rows. This one is lighter than `GroupPicker`'s centred modal, though:
 * an inline expanding list under the row, since it's a five-item pick already
 * sitting inside a full-bleed sheet, and a second stacked overlay on top of
 * that would be heavy-handed for what it's choosing.
 *
 * Picking a tone plays it — the point of the row is to hear the five, not
 * just read their names.
 */
export function AlarmTonePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = ALARM_TONES.find((t) => t.id === value) ?? ALARM_TONES[0];

  function select(id: AlarmToneId) {
    onChange(id);
    previewTone(id);
    setOpen(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <VolumeUpIcon className="h-6 w-6 shrink-0 text-brand-teal" />
        <span className="min-w-0 flex-1 text-lg font-bold text-[#0D1F44]">{current.label}</span>
        <ChevronDownIcon
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-2 pb-2">
          {ALARM_TONES.map((t) => {
            const selected = t.id === value;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => select(t.id)}
                aria-current={selected ? 'true' : undefined}
                className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors ${
                  selected
                    ? 'border-brand-teal bg-brand-teal-light'
                    : 'border-gray-300 bg-white hover:bg-gray-100'
                }`}
              >
                <span className="min-w-0 flex-1 font-bold text-[#222]">{t.label}</span>
                <span className="w-5 shrink-0">
                  {selected && <CheckIcon className="w-5 h-5 text-green-700" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
