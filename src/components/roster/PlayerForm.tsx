import { useRef, useState } from 'react';
import type { Player, Gender, Roster } from '../../types';
import { MAX_RATING, MIN_RATING } from '../../lib/rating';
import { RatingStepper } from '../RatingStepper';

interface Props {
  onSubmit: (name: string, rating: number, gender: Gender) => void;
  /** Rating a new player starts with — set from Settings. */
  defaultRating: number;
  editingPlayer?: Player | null;
  onCancelEdit?: () => void;
  /** Deletes the player outright. Only the edit dialog offers it. */
  onDelete?: () => void;
  /** Roster checkboxes — only rendered when editing an existing player. */
  rosters?: Roster[];
  selectedRosterIds?: string[];
  onRosterToggle?: (rosterId: string) => void;
  /** Overrides the submit label where "Add Player" would be the wrong words. */
  submitLabel?: string;
  /**
   * Puts the buttons on a row of their own under the fields, rather than in
   * line with them. The wide panel on the Players tab has room for them beside
   * Gender; a narrow one does not, and they end up wrapping one at a time.
   */
  stackActions?: boolean;
}

export function PlayerForm({
  onSubmit,
  defaultRating,
  editingPlayer,
  onCancelEdit,
  onDelete,
  rosters,
  selectedRosterIds,
  onRosterToggle,
  submitLabel,
  stackActions = false,
}: Props) {
  const [name, setName] = useState('');
  const [rating, setRating] = useState(String(defaultRating));
  const [gender, setGender] = useState<Gender>('M');
  // Set when submit is pressed with an empty name, to point at the field.
  const [nameMissing, setNameMissing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Populate the fields when a different player is picked for editing. Done
  // during render rather than in an effect so the form paints once, already
  // filled in. See https://react.dev/learn/you-might-not-need-an-effect
  const editing = editingPlayer ?? null;
  const [prevEditing, setPrevEditing] = useState<Player | null>(null);
  if (editing !== prevEditing) {
    setPrevEditing(editing);
    if (editing) {
      setName(editing.name);
      setRating(String(editing.rating));
      setGender(editing.gender);
    }
  }

  // A new default from Settings applies to the waiting Add Player form too —
  // but never overwrites the rating of the player currently being edited.
  const [prevDefault, setPrevDefault] = useState(defaultRating);
  if (defaultRating !== prevDefault) {
    setPrevDefault(defaultRating);
    if (!editing) setRating(String(defaultRating));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMissing(true);
      nameRef.current?.focus();
      return;
    }

    const r = parseFloat(rating);
    if (isNaN(r) || r < MIN_RATING || r > MAX_RATING) return;

    onSubmit(trimmed, r, gender);
    setNameMissing(false);
    setName('');
    setRating(String(defaultRating));
    setGender('M');
  }

  const showRosters = Boolean(editingPlayer && rosters && selectedRosterIds && onRosterToggle);
  // The group checkboxes always push the buttons down; a narrow panel asks for
  // the same thing without them.
  const actionsBelow = showRosters || stackActions;

  const actions = (
    <>
      <button
        type="submit"
        className="px-4 py-2 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-medium"
      >
        {submitLabel ?? (editingPlayer ? 'Update' : 'Add Player')}
      </button>
      {editingPlayer && onCancelEdit && (
        <button
          type="button"
          onClick={() => {
            onCancelEdit();
            setName('');
            setRating(String(defaultRating));
            setGender('M');
          }}
          className="px-4 py-2 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          Cancel
        </button>
      )}
      {/* Pushed to the far end of the row, away from the two buttons a thumb is
          aiming for. It only opens a warning; nothing goes on this press. */}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
        >
          Delete
        </button>
      )}
    </>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3 items-end flex-wrap">
      <div className="flex-1 min-w-[160px]">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Player Name
        </label>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameMissing(false);
          }}
          placeholder="Enter name"
          aria-invalid={nameMissing}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
            nameMissing
              ? 'border-red-500 bg-red-50 ring-2 ring-red-300 focus:ring-red-500'
              : 'border-gray-300 focus:ring-green-500'
          }`}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rating
        </label>
        <RatingStepper
          value={parseFloat(rating)}
          onChange={(next) => setRating(String(next))}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Gender
        </label>
        <div className="flex">
          <button
            type="button"
            onClick={() => setGender('M')}
            className={`px-4 py-2 text-sm font-medium rounded-l-md border transition-colors ${
              gender === 'M'
                ? 'bg-brand-teal text-white border-brand-teal'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            M
          </button>
          <button
            type="button"
            onClick={() => setGender('F')}
            className={`px-4 py-2 text-sm font-medium rounded-r-md border border-l-0 transition-colors ${
              gender === 'F'
                ? 'bg-brand-teal text-white border-brand-teal'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            F
          </button>
        </div>
      </div>
        {!actionsBelow && actions}
      </div>

      {showRosters && (
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">Groups</p>
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {rosters!.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={selectedRosterIds!.includes(r.id)}
                    onChange={() => onRosterToggle!(r.id)}
                    className="w-4 h-4 accent-green-600"
                  />
                  {r.name}
                </label>
              ))}
            </div>
            {selectedRosterIds!.length === 0 && (
              <p className="text-amber-600 text-xs mt-2">
                Not in any group &mdash; saving will offer to delete this player.
              </p>
            )}
          </div>
      )}

      {actionsBelow && <div className="flex gap-3">{actions}</div>}
    </form>
  );
}
