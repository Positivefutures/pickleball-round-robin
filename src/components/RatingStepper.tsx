import { step } from '../lib/rating';

/**
 * The minus / number / plus control for a player's rating.
 *
 * Extracted so the Add Player form and the Actions sheet's Edit Player Rating
 * step the same way, between the same bounds. See lib/rating.ts for those.
 */
export function RatingStepper({
  value,
  onChange,
  /** Bigger buttons where the control is the only thing on the page. */
  large = false,
}: {
  value: number;
  onChange: (rating: number) => void;
  large?: boolean;
}) {
  const button = large
    ? 'min-w-14 min-h-14 text-2xl'
    : 'min-w-9 min-h-10 text-lg';
  const readout = large ? 'min-w-20 text-3xl' : 'min-w-10';

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
