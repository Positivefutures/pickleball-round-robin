import type { Player } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { getDisplayName } from '../../utils/helpers';
import { EditPlayerButton } from './EditPlayerButton';
import { GuestChip } from './GuestChip';
import { GenderMark } from './GenderMark';

interface Props {
  players: Player[];
  roundIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  onOpenPlayerMenu: (player: Player) => void;
  allPlayers: Player[];
  readOnly?: boolean;
  /** Whether this round's format is built out of who is a man and who a woman. */
  showGender?: boolean;
}

function SitOutBox({
  player,
  roundIdx,
  sitOutIdx,
  selected,
  onPlayerTap,
  onOpenPlayerMenu,
  allPlayers,
  readOnly,
  showGender,
}: {
  player: Player;
  roundIdx: number;
  sitOutIdx: number;
  selected: boolean;
  onPlayerTap: (slot: PlayerSlot) => void;
  onOpenPlayerMenu: (player: Player) => void;
  allPlayers: Player[];
  readOnly: boolean;
  showGender: boolean;
}) {
  const interactive = !readOnly;

  return (
    <button
      type="button"
      onClick={() => interactive && onPlayerTap({ kind: 'sitout', roundIdx, sitOutIdx })}
      className={`relative inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border transition-colors ${
        selected
          ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-500'
          : 'bg-gray-100 border-gray-400 hover:bg-gray-200'
      }${interactive ? '' : ' cursor-default'}`}
    >
      {showGender && <GenderMark player={player} />}
      <span className="font-medium text-gray-900">{getDisplayName(player, allPlayers)}</span>
      <GuestChip player={player} />
      {selected && interactive ? (
        <EditPlayerButton player={player} onOpen={onOpenPlayerMenu} />
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
  onOpenPlayerMenu,
  allPlayers,
  readOnly = false,
  showGender = false,
}: Props) {
  // Nobody sitting out is nothing to say. The row used to render empty to carry
  // an Add Player button; that button has gone back to the Actions sheet.
  if (players.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium text-gray-500">Sitting out</p>
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
            onOpenPlayerMenu={onOpenPlayerMenu}
            allPlayers={allPlayers}
            readOnly={readOnly}
            showGender={showGender}
          />
        ))}
      </div>
    </div>
  );
}
