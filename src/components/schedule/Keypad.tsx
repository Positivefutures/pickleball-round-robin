/**
 * The pad the numbers are typed on.
 *
 * Shared by the two boxes that take a number — a game's score and what a court
 * is called — so the second one a host meets is the one they already know. Its
 * own keys rather than a text box, so the OS keyboard never comes up and shoves
 * Cancel and Done off the bottom of the screen.
 *
 * Three columns: the nine digits, then backspace, nought, and one key that
 * belongs to whoever is using the pad.
 */
const KEY =
  'min-h-12 rounded-md border border-[#999] bg-gray-100 font-bold text-gray-800 transition-colors hover:bg-gray-200 disabled:opacity-40';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface Props {
  /** Names the pad for a screen reader, and is what a test finds it by. */
  label: string;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  /** Nothing to rub out. */
  backspaceDisabled: boolean;
  /** The bottom right key: 11 on a score, Clear on a court number. */
  extraKey: { face: string; onPress: () => void };
}

export function Keypad({ label, onDigit, onBackspace, backspaceDisabled, extraKey }: Props) {
  return (
    // type="button" on every one of these. Inside a form, a bare button submits,
    // and each digit would save and close the box.
    <div
      role="group"
      aria-label={label}
      className="mx-auto mt-5 grid max-w-[15rem] grid-cols-3 gap-2"
    >
      {DIGITS.map((d) => (
        <button key={d} type="button" onClick={() => onDigit(d)} className={`${KEY} text-xl`}>
          {d}
        </button>
      ))}
      <button
        type="button"
        onClick={onBackspace}
        disabled={backspaceDisabled}
        aria-label="Backspace"
        className={`${KEY} text-xl`}
      >
        &#9003;
      </button>
      <button type="button" onClick={() => onDigit('0')} className={`${KEY} text-xl`}>
        0
      </button>
      <button
        type="button"
        onClick={extraKey.onPress}
        className={`${KEY} ${extraKey.face.length > 2 ? 'text-sm' : 'text-xl'}`}
      >
        {extraKey.face}
      </button>
    </div>
  );
}
