import type { ReactElement } from 'react';
import { DISCARD_WARNING } from '../../lib/steps';
import { CloseIcon, WarningIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';
import { TileButton, TILE_ROW } from '../TileButton';

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
  /** The shape on the confirm tile. Every tile in the app carries one. */
  confirmIcon: (props: { className?: string }) => ReactElement;
  /**
   * How hard the confirm button pushes back. Red is the default and means the
   * schedule is going; teal is for a change that costs less than it sounds,
   * where red would frighten the host off something quite ordinary.
   */
  tone?: 'destructive' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Standing between the host and work they cannot get back. Each door names
 * itself in the heading and in its buttons, and says underneath what it costs:
 * by default the warning in lib/steps, which New Round Robin in the Actions
 * sheet says too.
 *
 * Answered with the same tiles as its twin on the Actions sheet. New Round Robin
 * asks this question there and Generate asks it here, and a host who has met one
 * of them should recognise the other.
 */
export function DiscardScheduleDialog({
  heading,
  body = DISCARD_WARNING,
  cancelLabel,
  confirmLabel,
  confirmIcon,
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
        <div className={TILE_ROW}>
          <TileButton tone="quiet" Icon={CloseIcon} label={cancelLabel} onClick={onCancel} />
          <TileButton
            tone={tone === 'destructive' ? 'red' : 'teal'}
            Icon={confirmIcon}
            label={confirmLabel}
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}
