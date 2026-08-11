import { step } from '../lib/rating';

/**
 * The minus / number / plus control for a player's rating.
 *
 * Extracted so every form that sets one steps the same way, between the same
 * bounds: Add Player on the Players tab, the roster's own edit row, Add a Guest
 * and Edit Player from the schedule. See lib/rating.ts for the bounds.
 */
export function RatingStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const button = 'min-w-9 min-h-10 text-lg';
  const readout = 'min-w-10';

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Lower the rating"
        onClick={() => onChange(step(value, -0.1))}
        className={`${button} flex items-center justify-center border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold`}
      >
        &minus;
      </button>
      <span className={`${readout} text-center font-medium text-gray-800`}>
        {value.toFixed(1)}
      </span>
      <button
        type="button"
        aria-label="Raise the rating"
        onClick={() => onChange(step(value, 0.1))}
        className={`${button} flex items-center justify-center border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold`}
      >
        +
      </button>
    </div>
  );
}
