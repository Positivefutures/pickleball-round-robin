import type { Player } from '../../types';
import { CloseIcon, PencilIcon, RemovePlayerSolidIcon, SwapPeopleIcon } from '../icons';
import { TileButton, TILE_ROW } from '../TileButton';
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
 *
 * Subbing is here rather than on the Actions grid because it is one player's
 * business: the question it starts with is who is coming off, and tapping
 * somebody has already answered it. Its second half is still the sheet's,
 * which is where the list of who could come on lives, along with the way to a
 * newcomer who is in neither list yet.
 *
 * "Sub", not "swap". Swapping already means something on this page: two people
 * trading seats, which the hint under the first round teaches. A word that
 * meant both would be the wrong one twice.
 */
export function PlayerMenu({
  player,
  onEdit,
  onSub,
  onRemove,
  onCancel,
}: {
  player: Player;
  onEdit: () => void;
  /** Opens the sheet on Sub Player, with this one already coming off. */
  onSub: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);

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

        {/* Two by two rather than four across. The tiles are what every panel
            in the app answers with now, and four of them in a card this wide
            would put "Sub Someone In" on three lines. Two rows of the same
            component keep every tile one width, which a grid of mixed rows
            would not. */}
        <div className="space-y-3">
          <div className={TILE_ROW}>
            <TileButton tone="quiet" Icon={PencilIcon} label="Edit Player" onClick={onEdit} />
            <TileButton
              tone="quiet"
              Icon={SwapPeopleIcon}
              label="Sub Someone In"
              onClick={onSub}
            />
          </div>
          <div className={TILE_ROW}>
            {/* The Actions card for this says "Remove Player" and draws it in
                this shape. It is the same job from the other end of the app, so
                it is now the same word and the same glyph, not a bin. */}
            <TileButton
              tone="red"
              Icon={RemovePlayerSolidIcon}
              label="Remove Player"
              onClick={onRemove}
            />
            <TileButton tone="quiet" Icon={CloseIcon} label="Cancel" onClick={onCancel} />
          </div>
        </div>
      </div>
    </div>
  );
}
