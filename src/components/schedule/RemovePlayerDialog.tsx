import type { Player } from '../../types';
import { CloseIcon, RemovePlayerSolidIcon, WarningIcon } from '../icons';
import { PanelHeading } from '../PanelGlyph';
import { panelCard } from '../panelStyles';
import { TileButton, TILE_ROW } from '../TileButton';

interface Props {
  player: Player;
  /** Courts currently used by the remaining rounds. */
  currentCourts: number;
  /** Courts that can still be filled once this player leaves. */
  nextCourts: number;
  /** Players left after the removal. */
  remainingCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RemovePlayerDialog({
  player,
  currentCourts,
  nextCourts,
  remainingCount,
  onConfirm,
  onCancel,
}: Props) {
  const tooFewPlayers = remainingCount < 4;
  const courtsDropping = !tooFewPlayers && nextCourts < currentCourts;
  const sitOutsPerRound = remainingCount - nextCourts * 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={`bg-white ${panelCard} p-6 mx-4 max-w-sm w-full`}>
        {tooFewPlayers ? (
          <>
            <PanelHeading icon={WarningIcon} title={`Can’t remove ${player.name}`} />
            <p className="mt-2 mb-4 text-sm text-gray-600 text-center">
              Only {remainingCount} player{remainingCount === 1 ? '' : 's'} would be left, and a
              court needs 4.
            </p>
            {/* On its own, so not a tile: a single tile stretched across the
                box is a card, not a button. See TileButton. */}
            <button
              onClick={onCancel}
              className="w-full px-4 py-2.5 border border-[#999] bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-bold"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <div className="mb-4">
              <PanelHeading
                icon={WarningIcon}
                title={`Remove ${player.name} from remaining rounds?`}
              />
            </div>

            {courtsDropping && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
                This will reduce remaining rounds from {currentCourts} courts to {nextCourts}, with{' '}
                {sitOutsPerRound} player{sitOutsPerRound === 1 ? '' : 's'} sitting out each round.
              </p>
            )}

            {/* The same pair Remove Player answers with on the Actions sheet.
                "Remove" rather than "Yes", for the same reason: a tile carries
                a shape and a verb, and "Yes" beside a person-shaped glyph says
                nothing about what is about to happen to them. */}
            <div className={TILE_ROW}>
              <TileButton tone="quiet" Icon={CloseIcon} label="Cancel" onClick={onCancel} />
              <TileButton
                tone="red"
                Icon={RemovePlayerSolidIcon}
                label="Remove"
                onClick={onConfirm}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
