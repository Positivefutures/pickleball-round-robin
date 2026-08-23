import type { ReactNode } from 'react';
import type { Player } from '../../types';
import type { PlayerSlot } from './SchedulePage';
import { getDisplayName } from '../../utils/helpers';
import { useStoredValue } from '../../hooks/useStoredValue';
import * as stores from '../../lib/stores';
import { EditPlayerButton } from './EditPlayerButton';
import {
  PLAYER_NAME_TEXT, ROUND_EDGE, ROUND_EDGE_SWAPPED, SITOUT_FILL_SWAPPED,
} from './roundLook';

interface Props {
  players: Player[];
  roundIdx: number;
  selectedSlot: PlayerSlot | null;
  onPlayerTap: (slot: PlayerSlot) => void;
  onOpenPlayerMenu: (player: Player) => void;
  allPlayers: Player[];
  readOnly?: boolean;
  /** Players who have just changed places in this round. See RoundCard. */
  swappedIds?: string[];
  /** Which swap those ids belong to, so a second one restarts the fade. */
  swapSeq?: number;
  /**
   * Something to sit on the far end of the SITTING OUT line — View Standings,
   * on both the host's card and the live view.
   *
   * It rides here rather than under the chips because the two are the same size
   * and weight and were a hand's width apart down the card, which read as two
   * separate things rather than as a heading and the way on from it. The caller
   * still owns what happens when there is nobody sitting out and so no line for
   * it to sit on.
   */
  action?: ReactNode;
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
  swapped,
}: {
  player: Player;
  roundIdx: number;
  sitOutIdx: number;
  selected: boolean;
  onPlayerTap: (slot: PlayerSlot) => void;
  onOpenPlayerMenu: (player: Player) => void;
  allPlayers: Player[];
  readOnly: boolean;
  /** Whether this chip has just been swapped into. See index.css. */
  swapped: boolean;
}) {
  const interactive = !readOnly;
  // A chip is a name on the same schedule as a seat, so it answers to the same
  // switch. See the note beside the one in CourtMatchup.
  const [showRatings] = useStoredValue(stores.showRatings);

  return (
    <button
      type="button"
      onClick={() => interactive && onPlayerTap({ kind: 'sitout', roundIdx, sitOutIdx })}
      // The resting edge is the round's own line, so a chip reads as belonging
      // to the card it sits on. Selected keeps its blue and its ring: that is a
      // state you have put it in, and it has to stay tellable from the rest.
      //
      // A swapped chip only names the two colours to fade from. The animation
      // outranks this inline edge for the two seconds it runs and then hands it
      // straight back, which is why nothing here has to be undone afterwards.
      style={
        {
          ...(selected ? undefined : { borderColor: ROUND_EDGE }),
          ...(swapped
            ? {
                '--seat-swapped-from': ROUND_EDGE_SWAPPED,
                '--seat-swapped-fill': SITOUT_FILL_SWAPPED,
              }
            : undefined),
        } as React.CSSProperties
      }
      className={`inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border transition-colors ${
        swapped ? 'seat-swapped ' : ''
      }${
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
        showRatings && <span className="text-gray-500">{player.rating.toFixed(1)}</span>
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
  swappedIds,
  swapSeq,
  action,
}: Props) {
  // Nobody sitting out is nothing to say. The row used to render empty to carry
  // an Add Player button; that button has gone back to the Actions sheet.
  if (players.length === 0) return null;

  return (
    <div className="mt-4">
      {/* Set to match COURT # on the panels beside it: no size class on either,
          so both inherit 1rem and both grow together in large text. White, like
          everything else printed straight onto the round's card. */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-bold text-white">SITTING OUT</p>
        {action}
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map((player, sitOutIdx) => (
          <SitOutBox
            // Carrying which swap marked it, so a second swap of the same
            // person inside two seconds starts the fade again rather than
            // joining one already half spent. See CourtMatchup.
            key={
              swappedIds?.includes(player.id) ? `${player.id}:${swapSeq}` : player.id
            }
            swapped={!!swappedIds?.includes(player.id)}
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
