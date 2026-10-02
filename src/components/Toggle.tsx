/**
 * The two colours an on switch is ever drawn in.
 *
 * Teal everywhere the app is white, which is nearly everywhere. Orange on the
 * round timer once it is counting, where the sheet turns black: teal on black
 * is the one place in the app the brand's own colour sinks into its background,
 * and the alerts are what a host squints at from a court. Off is the same grey
 * on both, because an off switch is not wearing a colour.
 */
const ON: Record<'teal' | 'orange', string> = {
  teal: 'border-brand-teal-dark bg-brand-teal',
  orange: 'border-brand-orange-dark bg-brand-orange',
};

/**
 * An on/off switch, in the primary teal, or in the primary orange on a black
 * sheet. See ON above.
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
  tone = 'teal',
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  /** What the switch is for, read out in place of its state. */
  label: string;
  /** What colour it wears when it is on. See ON above. */
  tone?: 'teal' | 'orange';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex h-7 w-[3.125rem] shrink-0 items-center rounded-[6px] border-2 transition-colors ${
        checked ? ON[tone] : 'border-gray-400 bg-gray-200'
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

/**
 * A switch with its question beside it, as Keep Score is drawn.
 *
 * Choose Sit-Outs is drawn the same, over the player list, and the two are
 * meant to read as one kind of thing. One component is what keeps them so.
 */
export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  /** The question, ending in a question mark. Also what the switch reads out. */
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <h3 className="text-lg font-semibold text-gray-800">{label}</h3>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
