import { useState, useEffect } from 'react';
import type { Player, Gender } from '../../types';

interface Props {
  onSubmit: (name: string, rating: number, gender: Gender) => void;
  editingPlayer?: Player | null;
  onCancelEdit?: () => void;
}

export function PlayerForm({ onSubmit, editingPlayer, onCancelEdit }: Props) {
  const [name, setName] = useState('');
  const [rating, setRating] = useState('3.5');
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
    setRating('3.5');
    setGender('M');
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 items-end flex-wrap">
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
      <div className="w-24">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rating
        </label>
        <input
          type="number"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          min="3"
          max="5"
          step="0.1"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
      </div>
      <div className="w-20">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Gender
        </label>
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as Gender)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
      </div>
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
            setRating('3.5');
            setGender('M');
          }}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          Cancel
        </button>
      )}
    </form>
  );
}
