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
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rating
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRating(String(Math.max(3, Math.round((parseFloat(rating) - 0.1) * 10) / 10)))}
            className="w-9 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
          >
            &minus;
          </button>
          <span className="w-10 text-center font-medium text-gray-800">{parseFloat(rating).toFixed(1)}</span>
          <button
            type="button"
            onClick={() => setRating(String(Math.min(5, Math.round((parseFloat(rating) + 0.1) * 10) / 10)))}
            className="w-9 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-bold text-lg"
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
