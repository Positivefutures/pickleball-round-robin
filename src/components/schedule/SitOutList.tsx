import type { Player } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { getDisplayName } from '../../utils/helpers';
import { TrashIcon } from './icons';

interface Props {
  players: Player[];
  roundIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  onRequestRemove: (player: Player) => void;
  allPlayers: Player[];
  readOnly?: boolean;
}

function SitOutBox({
  player,
  roundIdx,
  sitOutIdx,
  selected,
  onPlayerTap,
  onRequestRemove,
  allPlayers,
  readOnly,
}: {
  player: Player;
  roundIdx: number;
  sitOutIdx: number;
  selected: boolean;
  onPlayerTap: (slot: PlayerSlot) => void;
  onRequestRemove: (player: Player) => void;
  allPlayers: Player[];
  readOnly: boolean;
}) {
  const interactive = !readOnly;

  return (
    <button
      type="button"
      onClick={() => interactive && onPlayerTap({ kind: 'sitout', roundIdx, sitOutIdx })}
      className={`inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border transition-colors ${
        selected
          ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-500'
          : 'bg-gray-100 border-gray-400 hover:bg-gray-200'
      }${interactive ? '' : ' cursor-default'}`}
    >
      <span className="font-medium text-gray-900">{getDisplayName(player, allPlayers)}</span>
      {selected && interactive ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Remove ${player.name}`}
          title={`Remove ${player.name}`}
          // Stop propagation so this doesn't register as the second tap of a swap
          onClick={(e) => {
            e.stopPropagation();
            onRequestRemove(player);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onRequestRemove(player);
            }
          }}
          className="p-0.5 -mr-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer"
        >
          <TrashIcon />
        </span>
      ) : (
        <span className="text-gray-500">{player.rating.toFixed(1)}</span>
      )}
    </button>
  );
}

export function SitOutList({
  players,
  roundIdx,
  selectedSlot,
  onPlayerTap,
  onRequestRemove,
  allPlayers,
  readOnly = false,
}: Props) {
  if (players.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-sm text-gray-500 font-medium mb-2">Sitting out</p>
      <div className="flex flex-wrap gap-2">
        {players.map((player, sitOutIdx) => (
          <SitOutBox
            key={player.id}
            player={player}
            roundIdx={roundIdx}
            sitOutIdx={sitOutIdx}
            selected={
              selectedSlot?.kind === 'sitout' &&
              selectedSlot.roundIdx === roundIdx &&
              selectedSlot.sitOutIdx === sitOutIdx
            }
            onPlayerTap={onPlayerTap}
            onRequestRemove={onRequestRemove}
            allPlayers={allPlayers}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}
