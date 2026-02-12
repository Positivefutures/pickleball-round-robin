import type { Player } from '../../types';

interface Props {
  players: Player[];
}

export function SitOutList({ players }: Props) {
  if (players.length === 0) return null;

  return (
    <div className="bg-gray-50 rounded-md p-3 mt-2">
      <span className="text-sm text-gray-500 font-medium">Sitting out: </span>
      <span className="text-sm text-gray-700">
        {players.map((p) => p.name).join(', ')}
      </span>
    </div>
  );
}
