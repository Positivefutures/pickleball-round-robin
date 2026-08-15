import { useRef } from 'react';

/**
 * Four boxes that together hold a four digit code.
 *
 * One box per digit rather than one field holding four, because the shape of
 * the thing is the instruction: nobody has to be told how long the code is if
 * there are exactly four places to put it. Typing a digit moves to the next box
 * on its own, so the whole code is four taps and no reaching.
 *
 * ## Why these are real inputs
 *
 * Everywhere else in the app that takes a number — a score, a court's name —
 * draws its own Keypad and a display that is not a text box, so the OS keyboard
 * never comes up. See the note at the top of Keypad.tsx. This one goes the other
 * way on purpose:
 *
 *   * Focus moving from box to box is the behaviour being asked for, and with a
 *     pad the focus would have to stay on the pad. Moving it would take the next
 *     key press away from the finger already on the 7.
 *   * `inputMode="numeric"` gets a number pad anyway. It is the phone's rather
 *     than the app's, but it is the pad a person expects when four small boxes
 *     ask for digits.
 *   * The reason Keypad gives for avoiding the OS keyboard is that it shoves
 *     Cancel and Done off the bottom. There is nothing under this: it is the
 *     last thing in the sheet, and the sheet scrolls.
 *
 * ## The value
 *
 * A string of nought to four digits, filled left to right with no gaps. Typing
 * always lands in the first empty box wherever you tapped, and backspace takes
 * the last one off. That is how a code is entered on a phone, and it is what
 * keeps the value a plain string rather than four slots that can each be empty.
 */

export const CODE_LENGTH = 4;

const BOX =
  'h-16 w-14 rounded-lg border-2 text-center text-3xl font-bold text-[#1F293D] ' +
  'transition-colors focus:outline-none focus:border-brand-teal focus:ring-2 ' +
  'focus:ring-brand-teal/30';

interface Props {
  /** Nought to four digits. Anything else is a bug in the caller. */
  value: string;
  onChange: (next: string) => void;
  /** Names the group of boxes for a screen reader. */
  label: string;
  /** Ties the boxes to the line of text explaining them. */
  describedBy?: string;
}

export function CodeEntry({ value, onChange, label, describedBy }: Props) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  /**
   * True while this component is the one moving the caret.
   *
   * The clamp on `onFocus` below is for fingers only. Without this it also
   * catches every move the component makes itself — the advance after a digit,
   * the step back on Backspace, both arrow keys — and drags each one back to
   * where the code happens to end, which defeats all four.
   */
  const moving = useRef(false);

  /** The box a digit would land in, which is the one after the last filled. */
  const nextBox = (code: string) => Math.min(code.length, CODE_LENGTH - 1);

  function focusBox(index: number) {
    moving.current = true;
    boxes.current[Math.max(0, Math.min(index, CODE_LENGTH - 1))]?.focus();
    moving.current = false;
  }

  function type(digits: string) {
    const clean = digits.replace(/\D/g, '');
    if (!clean) return;
    const next = (value + clean).slice(0, CODE_LENGTH);
    // Already full, or nothing usable arrived. Reporting an unchanged value
    // would be a render for no reason, and the caret is already right.
    if (next === value) {
      focusBox(nextBox(next));
      return;
    }
    onChange(next);
    focusBox(next.length);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Backspace') {
      // Always takes the last digit off, wherever the caret happens to be.
      // Anything cleverer would need the four slots to be separately empty,
      // and a four digit code is quicker to retype than to reason about.
      event.preventDefault();
      const next = value.slice(0, -1);
      onChange(next);
      focusBox(next.length);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      className="flex justify-center gap-3"
    >
      {Array.from({ length: CODE_LENGTH }, (_, index) => {
        const digit = value[index] ?? '';
        return (
          <input
            key={index}
            ref={(el) => {
              boxes.current[index] = el;
            }}
            // Not type="number": it brings a spinner on a desktop browser and
            // lets "e" and "-" be typed on some of them. A text box told to
            // want digits gets the pad without either.
            type="text"
            inputMode="numeric"
            autoComplete="off"
            // One character in the box at a time. Paste is handled by type(),
            // which takes as many digits as are left.
            maxLength={1}
            value={digit}
            aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
            onChange={(event) => type(event.target.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            // Tapping any box puts the caret where the next digit goes, rather
            // than leaving somebody typing into the middle of a half-typed
            // code. Only a finger: see `moving` above.
            onFocus={() => {
              if (moving.current) return;
              const target = nextBox(value);
              if (index !== target) focusBox(target);
            }}
            className={`${BOX} ${digit ? 'border-brand-teal bg-white' : 'border-panel-edge bg-[#F8F9FB]'}`}
          />
        );
      })}
    </div>
  );
}
