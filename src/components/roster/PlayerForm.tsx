import { useState, useEffect } from 'react';
import type { Player, Gender, Roster } from '../../types';

const DEFAULT_RATING = '4.0';

interface Props {
  onSubmit: (name: string, rating: number, gender: Gender) => void;
  editingPlayer?: Player | null;
  onCancelEdit?: () => void;
  /** Roster checkboxes — only rendered when editing an existing player. */
  rosters?: Roster[];
  selectedRosterIds?: string[];
  onRosterToggle?: (rosterId: string) => void;
}

export function PlayerForm({
  onSubmit,
  editingPlayer,
  onCancelEdit,
  rosters,
  selectedRosterIds,
  onRosterToggle,
}: Props) {
  const [name, setName] = useState('');
  const [rating, setRating] = useState(DEFAULT_RATING);
  const [gender, setGender] = useState<Gender>('M');

  useEffect(() => {
    if (editingPlayer) {
      setName(editingPlayer.name);
      setRating(String(editingPlayer.rating));
      setGender(editingPlayer.gender);
    }
  }, [editingPlayer]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const r = parseFloat(rating);
    if (isNaN(r) || r < 3 || r > 5) return;

    onSubmit(trimmed, r, gender);
    setName('');
    setRating(DEFAULT_RATING);
    setGender('M');
  }

  const showRosters = Boolean(editingPlayer && rosters && selectedRosterIds && onRosterToggle);

  const actions = (
    <>
      <button
        type="submit"
        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
      >
        {editingPlayer ? 'Update' : 'Add Player'}
      </button>
      {editingPlayer && onCancelEdit && (
        <button
          type="button"
          onClick={() => {
            onCancelEdit();
            setName('');
            setRating(DEFAULT_RATING);
            setGender('M');
          }}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          Cancel
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
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter name"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rating
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRating(String(Math.max(3, Math.round((parseFloat(rating) - 0.1) * 10) / 10)))}
            className="min-w-9 min-h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
          >
            &minus;
          </button>
          <span className="min-w-10 text-center font-medium text-gray-800">{parseFloat(rating).toFixed(1)}</span>
          <button
            type="button"
            onClick={() => setRating(String(Math.min(5, Math.round((parseFloat(rating) + 0.1) * 10) / 10)))}
            className="min-w-9 min-h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
          >
            +
          </button>
        </div>
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
                ? 'bg-green-600 text-white border-green-600'
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
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            F
          </button>
        </div>
      </div>
        {!showRosters && actions}
      </div>

      {showRosters && (
        <>
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
          <div className="flex gap-3">{actions}</div>
        </>
      )}
    </form>
  );
}
