import type { Player } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { getDisplayName } from '../../utils/helpers';
import { EditPlayerButton } from './EditPlayerButton';
import { PLAYER_NAME_TEXT, ROUND_EDGE } from './roundLook';

interface Props {
  players: Player[];
  roundIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  onOpenPlayerMenu: (player: Player) => void;
  allPlayers: Player[];
  readOnly?: boolean;
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
}: {
  player: Player;
  roundIdx: number;
  sitOutIdx: number;
  selected: boolean;
  onPlayerTap: (slot: PlayerSlot) => void;
  onOpenPlayerMenu: (player: Player) => void;
  allPlayers: Player[];
  readOnly: boolean;
}) {
  const interactive = !readOnly;

  return (
    <button
      type="button"
      onClick={() => interactive && onPlayerTap({ kind: 'sitout', roundIdx, sitOutIdx })}
      // The resting edge is the round's own line, so a chip reads as belonging
      // to the card it sits on. Selected keeps its blue and its ring: that is a
      // state you have put it in, and it has to stay tellable from the rest.
      style={selected ? undefined : { borderColor: ROUND_EDGE }}
      className={`inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border transition-colors ${
        selected
          ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-500'
          : 'bg-gray-100 hover:bg-gray-200'
      }${interactive ? '' : ' cursor-default'}`}
    >
      {/* The same size as a name on a court. They are the same thing, and one
          of them shrinking would read as the two meaning something different. */}
      <span className={`font-medium text-gray-900 ${PLAYER_NAME_TEXT}`}>
        {getDisplayName(player, allPlayers)}
      </span>
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
}: Props) {
  // Nobody sitting out is nothing to say. The row used to render empty to carry
  // an Add Player button; that button has gone back to the Actions sheet.
  if (players.length === 0) return null;

  return (
    <div className="mt-4">
      {/* Set to match COURT # on the panels beside it: no size class on either,
          so both inherit 1rem and both grow together in large text. White, like
          everything else printed straight onto the round's card. */}
      <p className="mb-2 font-bold text-white">SITTING OUT</p>
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
          />
        ))}
      </div>
    </div>
  );
}
