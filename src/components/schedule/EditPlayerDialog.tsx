import type { Gender, Player } from '../../types';
import { PlayerForm } from '../roster/PlayerForm';
import { useScrollLock } from '../../hooks/useScrollLock';

/**
 * Correcting what the app has written down about somebody, from the schedule.
 *
 * The same PlayerForm the Players tab uses, so there is one place that knows
 * what a name, a rating and a gender look like and one set of rules about an
 * empty name. What it does not carry is the group checkboxes: which groups
 * somebody belongs to is a decision for the Players tab, not something to be
 * changed with a court waiting.
 *
 * The change is saved against the player, so it holds for next time, and it is
 * written through every round including the ones already played. One person has
 * one name.
 */
export function EditPlayerDialog({
  player,
  defaultRating,
  onSave,
  onCancel,
}: {
  player: Player;
  defaultRating: number;
  onSave: (name: string, rating: number, gender: Gender) => void;
  onCancel: () => void;
}) {
  useScrollLock(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${player.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border-[3px] border-[#444] bg-white p-6 shadow-lg"
      >
        <h2 className="mb-4 text-[1.35rem] font-extrabold text-[#222]">Edit Player</h2>

        <PlayerForm
          defaultRating={defaultRating}
          editingPlayer={player}
          onCancelEdit={onCancel}
          submitLabel="Save Changes"
          stackActions
          onSubmit={onSave}
        />

        <p className="mt-4 text-sm text-gray-600">
          Saved against the player, so it holds for next time. Nobody changes court.
        </p>
      </div>
    </div>
  );
}
