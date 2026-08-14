import { DISCARD_WARNING } from '../../lib/steps';
import { WarningIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';

interface Props {
  heading: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Leaving a schedule behind by one of the step tabs. Each door names itself in
 * the heading and in its buttons; the warning is the one in lib/steps, which
 * New Round Robin in the Actions sheet says too.
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
      <div className={`bg-white ${panelCard} p-6 mx-4 max-w-sm w-full`}>
        {/* It was a line of body copy in the middle of the box, which read as
            the first half of the warning under it rather than as the question
            being asked. */}
        <PanelHeading icon={WarningIcon} title={heading} />
        <p className="mt-2 mb-4 text-sm text-gray-600 text-center">{DISCARD_WARNING}</p>
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
