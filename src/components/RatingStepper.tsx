import { step } from '../lib/rating';
import { STEPPER_KEY, STEPPER_VALUE } from './stepperLook';

/**
 * The minus / number / plus control for a player's rating.
 *
 * Extracted so every form that sets one steps the same way, between the same
 * bounds: Add Player on the Players tab, the roster's own edit row, Add Guest
 * and Edit Player from the schedule. See lib/rating.ts for the bounds.
 *
 * Painted like the courts and rounds steppers on Setup, out of `stepperLook`:
 * the same keys and the same ruled light-teal box. Its own sizes, though. This
 * one shares a row with a name field and a Gender toggle, and the two big
 * numbers on Setup have a row each.
 */
export function RatingStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const button = 'min-w-9 min-h-10 text-lg shrink-0 relative z-10';

  return (
    <div className="flex items-stretch">
      <button
        type="button"
        aria-label="Lower the rating"
        onClick={() => onChange(step(value, -0.1))}
        className={`${button} ${STEPPER_KEY}`}
      >
        &minus;
      </button>
      {/* Tucked under both keys, which are opaque and sit above it. */}
      <span className={`-mx-1.5 min-w-11 ${STEPPER_VALUE}`}>{value.toFixed(1)}</span>
      <button
        type="button"
        aria-label="Raise the rating"
        onClick={() => onChange(step(value, 0.1))}
        className={`${button} ${STEPPER_KEY}`}
      >
        +
      </button>
    </div>
  );
}
