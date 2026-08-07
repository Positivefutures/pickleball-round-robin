interface Props {
  rating: number;
  onChange: (rating: number) => void;
  onClose: () => void;
}

const MIN = 3;
const MAX = 5;

// Same bounds and 0.1 step as the rating control on the Add Player form.
function step(rating: number, delta: number): number {
  const next = Math.round((rating + delta) * 10) / 10;
  return Math.min(MAX, Math.max(MIN, next));
}

export function DefaultRatingPanel({ rating, onChange, onClose }: Props) {
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-lg border-[3px] border-[#444] bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-[1.35rem] font-extrabold text-[#222]">
          Default Player Rating
        </h2>
        <p className="mt-1 mb-4 text-center text-sm text-gray-600">
          The rating a new player starts with on the Add Player form.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onChange(step(rating, -0.1))}
            disabled={rating <= MIN}
            aria-label="Lower the default rating"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#999] bg-gray-200 text-lg font-bold text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-40"
          >
            &minus;
          </button>
          <span className="min-w-16 text-center text-2xl font-semibold text-gray-800">
            {rating.toFixed(1)}
          </span>
          <button
            type="button"
            onClick={() => onChange(step(rating, 0.1))}
            disabled={rating >= MAX}
            aria-label="Raise the default rating"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#999] bg-gray-200 text-lg font-bold text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-40"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-md bg-green-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}
