import { useState, type FormEvent } from 'react';
import { MAX_COURT_NUMBER, parseCourtNumber } from '../../lib/courtNumbers';
import { useScrollLock } from '../../hooks/useScrollLock';
import { ScorePanel } from './Scoreboard';
import { Keypad } from './Keypad';

/** No hall has a court 100. Also the width of the panel. */
const MAX_DIGITS = String(MAX_COURT_NUMBER).length;

interface Props {
  /** What the court is called now, and what the box opens on. */
  courtNumber: number;
  /** The round this was opened from. The change runs from here forwards. */
  roundNumber: number;
  onDone: (courtNumber: number) => void;
  onCancel: () => void;
}

/**
 * Renaming a court.
 *
 * The same panel and pad as the score box, with one number instead of two and
 * no nudges: a court is called what the centre calls it, and 7 is not one more
 * than 6 in any sense worth a button. Sharing the pad means the second box a
 * host meets is the one they already know.
 *
 * Still a form, so the whole job is a tap, a digit and Done.
 */
export function CourtNumberDialog({ courtNumber, roundNumber, onDone, onCancel }: Props) {
  const [text, setText] = useState(String(courtNumber));
  // The number it opened on is what the court is called, not the start of what
  // is being typed. The first digit replaces it, the way the old text box
  // opened with its contents selected.
  const [fresh, setFresh] = useState(true);
  const parsed = parseCourtNumber(text);

  useScrollLock(true);

  function pressDigit(digit: string) {
    const next = ((fresh ? '' : text) + digit).replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS);
    setFresh(false);
    setText(next);
  }

  function edit(next: string) {
    setFresh(false);
    setText(next);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (parsed === null) return;
    onDone(parsed);
  }

  return (
    // Up at the top rather than centred, as the score box is, so the two open
    // in the same place.
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-6">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Court number"
        className="mx-4 max-h-[92vh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-lg border-[3px] border-[#444] bg-white p-6 shadow-lg"
      >
        <h2 className="text-[1.35rem] font-extrabold text-[#222] mb-1">Court Number</h2>
        <p className="text-sm text-gray-600 mb-4">
          This changes Round {roundNumber} and every round after it. Earlier rounds and
          finished ones keep the number they have.
        </p>

        <div className="flex justify-center">
          {/* Read out on its own, because unlike a score there is no second
              panel to say which of the two this is. */}
          <span role="status" aria-label={`Court number ${text === '' ? 'not set' : text}`}>
            <ScorePanel value={text} tone="blank" active />
          </span>
        </div>

        <Keypad
          label="Court number keypad"
          onDigit={pressDigit}
          onBackspace={() => edit(text.slice(0, -1))}
          backspaceDisabled={text === ''}
          extraKey={{ face: 'Clear', onPress: () => edit('') }}
        />

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={parsed === null}
            className="flex-1 px-4 py-2.5 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Done
          </button>
        </div>
      </form>
    </div>
  );
}
