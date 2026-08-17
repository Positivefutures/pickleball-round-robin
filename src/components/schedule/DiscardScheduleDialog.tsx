import { DISCARD_WARNING } from '../../lib/steps';
import { WarningIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';

interface Props {
  heading: string;
  /**
   * What is about to be lost. Defaults to the whole schedule, which is what
   * every door out of one costs; Set Round Types passes its own, because it
   * keeps the rounds already played and only rebuilds the rest.
   */
  body?: string;
  cancelLabel: string;
  confirmLabel: string;
  /**
   * How hard the confirm button pushes back. Red is the default and means the
   * schedule is going; teal is for a change that costs less than it sounds,
   * where red would frighten the host off something quite ordinary.
   */
  tone?: 'destructive' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRM_TONE = {
  destructive: 'bg-red-600 hover:bg-red-700',
  primary: 'bg-brand-teal hover:bg-brand-teal-dark',
} as const;

/**
 * Standing between the host and work they cannot get back. Each door names
 * itself in the heading and in its buttons, and says underneath what it costs:
 * by default the warning in lib/steps, which New Round Robin in the Actions
 * sheet says too.
 */
export function DiscardScheduleDialog({
  heading,
  body = DISCARD_WARNING,
  cancelLabel,
  confirmLabel,
  tone = 'destructive',
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
        <p className="mt-2 mb-4 text-sm text-gray-600 text-center">{body}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-white rounded-md transition-colors font-medium ${CONFIRM_TONE[tone]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
