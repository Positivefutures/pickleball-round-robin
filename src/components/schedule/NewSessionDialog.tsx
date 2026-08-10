interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Starting over: the schedule goes, the crowd stays selected for the next one.
 *
 * Shown from two places — the New Session button below the schedule and the
 * Players tab above it — which is why the words live here rather than in either
 * of them.
 */
export function NewSessionDialog({ onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg border-[3px] border-[#444] shadow-lg p-6 mx-4 max-w-sm w-full">
        <p className="text-gray-800 text-center font-medium mb-2">Start a new session?</p>
        <p className="text-sm text-gray-600 text-center mb-4">
          This clears the current schedule.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
          >
            Yes, Start New
          </button>
        </div>
      </div>
    </div>
  );
}
