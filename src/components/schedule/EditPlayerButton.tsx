import type { Player } from '../../types';
import { PencilIcon } from '../icons';

/**
 * What a place on the schedule offers once it has been tapped.
 *
 * It used to be a bin, which did one thing and did it the moment it was
 * pressed. Now it opens a short menu, because taking somebody off for the rest
 * of the afternoon and correcting the spelling of their name are both things a
 * host wants from the same place, and only one of them should be a bin.
 *
 * A span with a role rather than a button: the place it sits in is itself a
 * button, and a button inside a button is not markup a browser will keep.
 * Both handlers stop the event, or the tap would also register as the second
 * half of a swap.
 */
export function EditPlayerButton({
  player,
  onOpen,
}: {
  player: Player;
  onOpen: (player: Player) => void;
}) {
  const label = `Edit ${player.name}`;
  return (
    <span
      data-tutorial="edit-player"
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-haspopup="dialog"
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(player);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onOpen(player);
        }
      }}
      // White on a border, not a colour of its own. It lands on a blue place and
      // an orange one, and anything tinted reads as belonging to one of them.
      // The negative margins let it stand taller than the row without making the
      // row taller, so the courts either side of it still line up.
      className="-my-1 -mr-1 flex shrink-0 cursor-pointer items-center rounded-md border
                 border-gray-400 bg-white px-2 py-1.5 text-gray-700 shadow-sm
                 transition-colors hover:bg-gray-100"
    >
      <PencilIcon className="h-5 w-5" />
    </span>
  );
}
