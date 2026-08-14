import type { Player } from '../../types';
import { PencilIcon } from '../icons';
import { TrashIcon } from './icons';
import { useScrollLock } from '../../hooks/useScrollLock';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';

/**
 * What can be done to one player, mid-session.
 *
 * A box on the schedule used to offer a bin and nothing else, so the only thing
 * a host could do to somebody standing in front of them was send them home. The
 * two things they actually want are here instead: take this person off for the
 * rest of the afternoon, or fix what the app has written down about them.
 *
 * Built like RemovePlayerDialog rather than like the Actions sheet, because it
 * belongs to one player on one card. The sheet is for the session.
 */
export function PlayerMenu({
  player,
  onEdit,
  onRemove,
  onCancel,
}: {
  player: Player;
  onEdit: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);

  const row =
    'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left font-medium transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Options for ${player.name}`}
        // Stops a tap inside the panel from reaching the backdrop behind it.
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm ${panelCard} bg-white p-6`}
      >
        <PanelHeading icon={PencilIcon} title={player.name} />
        <p className="mt-1 mb-4 text-center text-sm text-gray-600">
          {/* The words the rest of the app uses. Everywhere else a player is M
              or F and carries a Rating, and this was the one place saying it
              another way. */}
          {player.gender === 'F' ? 'Female' : 'Male'}, Rating: {player.rating.toFixed(1)}
        </p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onEdit}
            className={`${row} border-[#D8DEE4] bg-white text-gray-800 hover:bg-[#F1F3F6]`}
          >
            <PencilIcon className="h-5 w-5 text-gray-600" />
            Edit Player
          </button>
          <button
            type="button"
            onClick={onRemove}
            className={`${row} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
          >
            <TrashIcon className="h-5 w-5" />
            Remove from Remaining Rounds
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="mt-5 w-full rounded-md border border-[#999] bg-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
