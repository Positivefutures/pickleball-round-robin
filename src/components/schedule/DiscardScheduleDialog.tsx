import type { ReactElement, ReactNode } from 'react';
import { CloseIcon, ShareIcon, WarningIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';
import { TileButton, TILE_ROW } from '../TileButton';

interface Props {
  heading: string;
  /**
   * The glyph over the question. Defaults to the warning triangle, which is
   * what a dialog that only takes something away should open with; the one
   * asking to go back to a tab wears that tab's own shape instead.
   */
  icon?: (props: { className?: string }) => ReactElement;
  /**
   * What is about to be lost. A node rather than a string: the group being
   * deleted is named in bold inside the sentence, where the tab being taken is
   * named in the heading instead.
   */
  body: ReactNode;
  /**
   * The reassuring half, shown under the body on the share glyph.
   *
   * Only ever passed when there is a live link: a host who has sent a QR code
   * to fourteen people needs to know that rebuilding does not ask them all to
   * scan another one, and a host who has sent nothing should not be told about
   * a link they have never made. Set apart from the body because it is the one
   * line here that is good news.
   */
  shareNote?: ReactNode;
  cancelLabel: string;
  /**
   * The shape on the way out. Defaults to the cross, which is what a dialog
   * answered with "no" should wear; the one offering to stay puts the tab it
   * would be staying on there instead.
   */
  cancelIcon?: (props: { className?: string }) => ReactElement;
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
  icon = WarningIcon,
  body,
  shareNote,
  cancelLabel,
  cancelIcon = CloseIcon,
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
        <PanelHeading icon={icon} title={heading} />
        <p className="mt-2 text-sm text-gray-600 text-center">{body}</p>
        {shareNote && (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-brand-teal">
            <ShareIcon className="h-4 w-4" />
            <span>{shareNote}</span>
          </p>
        )}
        <div className={`${TILE_ROW} mt-4`}>
          <TileButton tone="quiet" Icon={cancelIcon} label={cancelLabel} onClick={onCancel} />
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
