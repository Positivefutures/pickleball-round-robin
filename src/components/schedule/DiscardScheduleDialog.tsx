import type { ReactElement, ReactNode } from 'react';
import { CloseIcon, WarningIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';
import { TileButton, TILE_ROW } from '../TileButton';

interface Props {
  heading: string;
  /**
   * What is about to be lost. A node rather than a string: the one thing this
   * says is where the host is going, and the destination is set in bold inside
   * the sentence.
   */
  body: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  /** The shape on the confirm tile. Every tile in the app carries one. */
  confirmIcon: (props: { className?: string }) => ReactElement;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Standing between the host and work they cannot get back.
 *
 * One door leads here: leaving the Schedule tab for Players or Setup with an
 * afternoon on the board. The heading asks the question, the line under it says
 * what a yes costs, and the buttons name the tab they land on.
 *
 * Answered with the same tiles as its twin on the Actions sheet. New Round Robin
 * asks this question there and the tabs ask it here, and a host who has met one
 * of them should recognise the other. Red on the confirm, always: nothing
 * reaches this dialog that does not throw a session away.
 */
export function DiscardScheduleDialog({
  heading,
  body,
  cancelLabel,
  confirmLabel,
  confirmIcon,
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
            tone="red"
            Icon={confirmIcon}
            label={confirmLabel}
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}
