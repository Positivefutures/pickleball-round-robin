import { useEffect, useRef, useState } from 'react';
import type { Player, Gender, Roster } from '../../types';
import { MAX_RATING, MIN_RATING } from '../../lib/rating';
import { RatingStepper } from '../RatingStepper';
import { FIELD_LABEL } from '../formLook';

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
   * Overrides the name field's label for the same reason. Adding a guest uses
   * this form, and on that panel the person being named is not a player yet.
   */
  nameLabel?: string;
  /**
   * Puts the buttons on a row of their own under the fields, rather than in
   * line with them. The wide panel on the Players tab has room for them beside
   * Gender; a narrow one does not, and they end up wrapping one at a time.
   */
  stackActions?: boolean;
  /**
   * Says "<name> was added" beside the button, and fades it out.
   *
   * Only the Players tab asks for it. Every other form built from this one
   * either closes on save or is answered by the sheet's own flash, and the one
   * that stays open is the one where the player just added has landed in a list
   * a host cannot see while the keyboard is up.
   */
  announceAdded?: boolean;
}

/** How long the line takes to go, and how long it stays in the page. */
const ANNOUNCE_MS = 2000;

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
  nameLabel = 'Player Name',
  stackActions = false,
  announceAdded = false,
}: Props) {
  const [name, setName] = useState('');
  const [rating, setRating] = useState(String(defaultRating));
  const [gender, setGender] = useState<Gender>('M');
  // Set when submit is pressed with an empty name, to point at the field.
  const [nameMissing, setNameMissing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  /**
   * Who was just added, and how many have been. The count is the element's key,
   * so a second name restarts the fade rather than joining one already halfway
   * through — remounting is the only way to replay a CSS animation.
   */
  const [added, setAdded] = useState<{ name: string; n: number } | null>(null);
  const addedTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(addedTimer.current), []);

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
    if (announceAdded && !editingPlayer) {
      setAdded((prev) => ({ name: trimmed, n: (prev?.n ?? 0) + 1 }));
      window.clearTimeout(addedTimer.current);
      // Taken out of the page once it has faded, rather than left invisible:
      // a line a screen reader can still find is a line still being said.
      addedTimer.current = window.setTimeout(() => setAdded(null), ANNOUNCE_MS);
    }
    setRating(String(defaultRating));
    // Gender stays where it was put. A roster is typed in in runs, and snapping
    // back to M after every save means setting it again for each of the women.
    // The rating does go back to the default, which is a number somebody chose
    // for exactly this: what a new player starts on.
    // Straight on to the next one. Twenty players is twenty names typed in a
    // row, and letting the keyboard drop between each of them means twenty
    // taps back into the same field. Not while editing: that Save closes a
    // dialog, and there is nothing left to type into.
    if (!editingPlayer) nameRef.current?.focus();
  }

  const showRosters = Boolean(editingPlayer && rosters && selectedRosterIds && onRosterToggle);
  // The group checkboxes always push the buttons down; a narrow panel asks for
  // the same thing without them.
  const actionsBelow = showRosters || stackActions;

  const submit = (
    <button
      type="submit"
      className="px-4 py-2 bg-brand-teal text-white rounded-md hover:bg-brand-teal-dark transition-colors font-bold"
    >
      {submitLabel ?? (editingPlayer ? 'Update' : 'Add Player')}
    </button>
  );

  const actions = (
    <>
      {/* Cancel first, so Update sits to its right. Every dialog in the app
          that puts the two on one line does it this way round — the court
          number, the score, and adding to a group — and this form was the
          exception. Only the edit case shows both: adding a player has no
          Cancel to sit beside. Order on the page only, and Enter still presses
          the submit button wherever it is drawn. */}
      {editingPlayer && onCancelEdit && (
        <button
          type="button"
          onClick={() => {
            onCancelEdit();
            setName('');
            setRating(String(defaultRating));
            setGender('M');
          }}
          className="px-4 py-2 border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold"
        >
          Cancel
        </button>
      )}
      {/* The button and what it has just said, as one thing.
          The row above wraps on a phone, and left as two items the line landed
          on the far left under the gender keys rather than beside the button it
          belongs to. Bound together they wrap as a pair, and the words are to
          the right of the button at any width. */}
      {announceAdded ? (
        <span className="flex items-center gap-3">
          {submit}
          {/* In the teal the app confirms in, gone two seconds later. The field
              keeps the focus and the keyboard stays up, so this is the only
              thing that says the name went anywhere. */}
          {added && (
            <span key={added.n} role="status" className="fade-out-2s font-bold text-brand-teal">
              {added.name} was added
            </span>
          )}
        </span>
      ) : (
        submit
      )}
      {/* Pushed to the far end of the row, away from the two buttons a thumb is
          aiming for. It only opens a warning; nothing goes on this press. */}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-bold"
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
        <label className={`${FIELD_LABEL} mb-1`}>
          {nameLabel}
        </label>
        {/* Every offer of help is turned off here. A field labelled Player Name
            with no autocomplete set is read by browsers and password managers
            as somewhere to put the owner's own contact details, and the panel
            each of them opens over it is the most likely thing behind the page
            jumping to the foot of itself as a name is typed. Nothing here wants
            a saved address, a spelling correction or a capital in the middle of
            McDonald, and a name does want its first letter capitalised. */}
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameMissing(false);
          }}
          placeholder="Enter name"
          autoComplete="off"
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          aria-invalid={nameMissing}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
            nameMissing
              ? 'border-red-500 bg-red-50 ring-2 ring-red-300 focus:ring-red-500'
              : 'border-gray-300 focus:ring-green-500'
          }`}
        />
      </div>
      <div>
        <label className={`${FIELD_LABEL} mb-1`}>
          Rating
        </label>
        <RatingStepper
          value={parseFloat(rating)}
          onChange={(next) => setRating(String(next))}
        />
      </div>
      <div>
        <label className={`${FIELD_LABEL} mb-1`}>
          Gender
        </label>
        <div className="flex">
          <button
            type="button"
            onClick={() => setGender('M')}
            className={`px-4 py-2 text-sm font-bold rounded-l-md border transition-colors ${
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
            className={`px-4 py-2 text-sm font-bold rounded-r-md border border-l-0 transition-colors ${
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
            <p className={`${FIELD_LABEL} mb-2`}>Groups</p>
            {/* Was a flat 176px, which is six groups on any phone ever made.
                A share of the screen instead, so a host with ten sees ten. */}
            <div className="space-y-1 max-h-[45vh] overflow-y-auto overscroll-contain">
              {rosters!.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={selectedRosterIds!.includes(r.id)}
                    onChange={() => onRosterToggle!(r.id)}
                    className="w-4 h-4 accent-brand-teal"
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
