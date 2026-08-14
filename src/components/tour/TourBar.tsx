import { BAR_H } from '../../lib/tourGeometry';

/**
 * Back, forward and Skip, in the same place on every card.
 *
 * Fixed at the foot rather than riding inside a bubble, because two of the
 * cards have two bubbles and the buttons cannot live in both. Keeping them still
 * while everything else moves is also the thing that makes the tour feel short:
 * the only question on any card is whether to tap the same button again.
 *
 * Its height is BAR_H, shared with the geometry so bubbles are never placed
 * underneath it. Change the padding here and change that.
 */
export function TourBar({
  onBack,
  onNext,
  onSkip,
  nextLabel,
  canBack,
  stepNumber,
  stepCount,
}: {
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  nextLabel: string;
  canBack: boolean;
  stepNumber: number;
  stepCount: number;
}) {
  return (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-0 flex flex-col items-center justify-center gap-1.5 border-t border-gray-200 bg-white px-4 shadow-[0_-6px_20px_rgba(0,0,0,0.14)]"
      style={{ height: BAR_H }}
    >
      <div className="flex w-full max-w-sm items-center gap-3">
        {/* Absent, not disabled, on the first card of an act. */}
        {canBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 flex-1 rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="min-h-11 flex-1 rounded-md bg-brand-teal px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-teal-dark"
        >
          {nextLabel}
        </button>
      </div>
      <div className="flex w-full max-w-sm items-center justify-between text-xs text-gray-400">
        <span>
          Step {stepNumber} of {stepCount}
        </span>
        {/* Quiet on purpose. It is the way out for somebody who already knows
            the app, and it should never look like the thing to tap. */}
        <button
          type="button"
          onClick={onSkip}
          className="underline underline-offset-2 transition-colors hover:text-gray-600"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
