import { useState } from 'react';
import { ALARM_TONES, previewTone, resolveTone, type AlarmToneId } from '../../lib/alarmSounds';
import { CheckIcon, ChevronDownIcon } from '../icons';
import { VolumeUpIcon } from './timerIcons';

interface Props {
  value: AlarmToneId;
  onChange: (id: AlarmToneId) => void;
  /**
   * Drawn for the black sheet rather than the white one.
   *
   * The host only ever sees this before the countdown starts, which is the one
   * phase that stays light. A watcher's timer is always counting, so their copy
   * of these controls lives on the dark sheet, and white-on-white is not a
   * choice anybody can make. A prop rather than a second component: what these
   * seven tones are called, what picking one does, and the fact that picking
   * one plays it are the parts worth having in a single place.
   */
  dark?: boolean;
}

const LOOK = {
  light: {
    label: 'text-[#0D1F44]',
    chevron: 'text-gray-400',
    row: 'border-gray-300 bg-white hover:bg-gray-100',
    rowInk: 'text-[#222]',
    chosen: 'border-brand-teal bg-brand-teal-light',
    tick: 'text-green-700'
  },
  dark: {
    label: 'text-white',
    chevron: 'text-gray-500',
    row: 'border-white/20 bg-white/5 hover:bg-white/10',
    rowInk: 'text-white',
    chosen: 'border-brand-teal bg-brand-teal/25',
    tick: 'text-green-400'
  }
};

/**
 * Choosing which of the seven tones plays when time is up.
 *
 * A native `<select>` hands the list to the OS, which is the browser's own
 * grey menu rather than this app's — the same reason `GroupPicker` draws its
 * own rows. This one is lighter than `GroupPicker`'s centred modal, though:
 * an inline expanding list under the row, since it's a short pick already
 * sitting inside a full-bleed sheet, and a second stacked overlay on top of
 * that would be heavy-handed for what it's choosing.
 *
 * Picking a tone plays it — the point of the row is to hear them, not just
 * read their names. It is also what puts the file in the runtime cache, so a
 * tone that has been chosen is a tone that will ring with no signal.
 */
export function AlarmTonePicker({ value, onChange, dark = false }: Props) {
  const [open, setOpen] = useState(false);
  const look = dark ? LOOK.dark : LOOK.light;
  // Through resolveTone, so a tone stored by the synthesized build reads as the
  // recording that replaced it rather than falling back to the top of the list.
  const selectedId = resolveTone(value);
  const current = ALARM_TONES.find((t) => t.id === selectedId) ?? ALARM_TONES[0];

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
        <span className={`min-w-0 flex-1 text-lg font-bold ${look.label}`}>{current.label}</span>
        <ChevronDownIcon
          className={`h-5 w-5 shrink-0 ${look.chevron} transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-2 pb-2">
          {ALARM_TONES.map((t) => {
            const selected = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => select(t.id)}
                aria-current={selected ? 'true' : undefined}
                className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors ${
                  selected ? look.chosen : look.row
                }`}
              >
                <span className={`min-w-0 flex-1 font-bold ${look.rowInk}`}>{t.label}</span>
                <span className="w-5 shrink-0">
                  {selected && <CheckIcon className={`w-5 h-5 ${look.tick}`} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
