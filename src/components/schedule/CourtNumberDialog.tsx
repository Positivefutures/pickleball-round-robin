import { useState, type FormEvent } from 'react';
import { MAX_COURT_NUMBER, parseCourtNumber } from '../../lib/courtNumbers';

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
 * One box, opened on the number already there and with it selected, so the
 * whole job is a tap, a digit and Done. A form rather than a pair of buttons
 * because the keypad on a phone offers Go, and that has to save it too.
 */
export function CourtNumberDialog({ courtNumber, roundNumber, onDone, onCancel }: Props) {
  const [text, setText] = useState(String(courtNumber));
  const parsed = parseCourtNumber(text);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (parsed === null) return;
    onDone(parsed);
  }

  return (
    // Up at the top rather than centred. The box opens with the keypad already
    // up on a phone, and centred put Cancel and Done underneath it.
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-6">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg border-[3px] border-[#444] shadow-lg p-6 mx-4 max-w-sm w-full"
      >
        <h2 className="text-[1.35rem] font-extrabold text-[#222] mb-1">Court Number</h2>
        <p className="text-sm text-gray-600 mb-4">
          This changes Round {roundNumber} and every round after it. Earlier rounds and
          finished ones keep the number they have.
        </p>

        {/* inputMode rather than type="number": it still brings up the keypad on
            a phone, without the spinners, and text is the only kind of box a
            browser will let us preselect. */}
        <input
          type="text"
          inputMode="numeric"
          maxLength={String(MAX_COURT_NUMBER).length}
          autoFocus
          value={text}
          aria-label="Court number"
          onFocus={(e) => e.target.select()}
          onChange={(e) => setText(e.target.value)}
          className="w-full px-3 py-2 mb-5 text-center text-2xl font-bold border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />

        <div className="flex gap-3">
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
            className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Done
          </button>
        </div>
      </form>
    </div>
  );
}
