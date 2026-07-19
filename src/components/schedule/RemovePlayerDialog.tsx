import type { Player } from '../../types';

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
      <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-sm w-full">
        {tooFewPlayers ? (
          <>
            <p className="text-gray-800 text-center font-medium mb-2">
              Can&rsquo;t remove {player.name}
            </p>
            <p className="text-sm text-gray-600 text-center mb-4">
              Only {remainingCount} player{remainingCount === 1 ? '' : 's'} would be left, and a
              court needs 4.
            </p>
            <button
              onClick={onCancel}
              className="w-full px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-800 text-center font-medium mb-4">
              Remove {player.name} from remaining rounds?
            </p>

            {courtsDropping && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
                This will reduce remaining rounds from {currentCourts} courts to {nextCourts}, with{' '}
                {sitOutsPerRound} player{sitOutsPerRound === 1 ? '' : 's'} sitting out each round.
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
              >
                Yes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
