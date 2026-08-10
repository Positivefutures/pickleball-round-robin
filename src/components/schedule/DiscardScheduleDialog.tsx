interface Props {
  heading: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Leaving a schedule behind, by whichever door: the Setup tab, the Players tab,
 * or the New Session button. Each door names itself in the heading and in its
 * buttons, but the warning is one sentence held here rather than passed in, so
 * no route out of a schedule can quietly undersell what it costs.
 */
export function DiscardScheduleDialog({
  heading,
  cancelLabel,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg border-[3px] border-[#444] shadow-lg p-6 mx-4 max-w-sm w-full">
        <p className="text-gray-800 text-center font-medium mb-2">{heading}</p>
        <p className="text-sm text-gray-600 text-center mb-4">
          This will discard the current schedule including any swaps you've made
          and rounds you've marked complete.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
