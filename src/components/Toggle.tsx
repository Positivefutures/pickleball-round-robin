/**
 * An on/off switch, in the primary teal.
 *
 * `role="switch"` rather than a checkbox, so a screen reader says "on" and "off"
 * and not "ticked". The knob is a box like the track, sliding its own width
 * across it.
 *
 * It lived inside the Setup panel until the Special Game Types panel wanted the
 * same thing in place of a pair of Yes/No radios. One switch says the same as two
 * radios in a third of the width, and it is already the shape people have learnt
 * from Keep Score.
 */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  /** What the switch is for, read out in place of its state. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex h-7 w-[3.125rem] shrink-0 items-center rounded-[6px] border-2 transition-colors ${
        checked ? 'border-brand-teal-dark bg-brand-teal' : 'border-gray-400 bg-gray-200'
      }`}
    >
      {/* Travel is the track's inside width less the knob's: 46 − 22. */}
      <span
        className={`block h-[22px] w-[22px] rounded-[4px] bg-white shadow transition-transform duration-150 ${
          checked ? 'translate-x-[1.5rem]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
