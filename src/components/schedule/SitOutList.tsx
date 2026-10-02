import type { ReactNode } from 'react';
import type { Player } from '../../types';
import type { PlayerSlot, SitOutSlot } from './SchedulePage';
import { getDisplayName } from '../../utils/helpers';
import { useStoredValue } from '../../hooks/useStoredValue';
import * as stores from '../../lib/stores';
import { EditPlayerButton } from './EditPlayerButton';
import { PadlockIcon } from './PadlockIcon';
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
  /** Who is locked to the bench this round. See Round.lockedSitOutIds. */
  lockedIds?: string[];
  /** The locked sit-out showing its pencil, if it is one of these. */
  pencilSlot?: SitOutSlot | null;
  onLockedTap?: (slot: SitOutSlot) => void;
  /** The padlock under a name. Absent, no padlocks are drawn. */
  onToggleLock?: (roundIdx: number, playerId: string) => void;
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
  locked,
  pencilOnly,
  onLockedTap,
  onToggleLock,
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
  /** Locked to the bench for this round. */
  locked: boolean;
  /** Locked, and tapped: show the pencil and nothing else. */
  pencilOnly: boolean;
  onLockedTap?: (slot: SitOutSlot) => void;
  onToggleLock?: (roundIdx: number, playerId: string) => void;
}) {
  const interactive = !readOnly;
  // A chip is a name on the same schedule as a seat, so it answers to the same
  // switch. See the note beside the one in CourtMatchup.
  const [showRatings] = useStoredValue(stores.showRatings);
  const slot: SitOutSlot = { kind: 'sitout', roundIdx, sitOutIdx };
  // A locked sit-out behaves as a locked seat on a court does: a tap shows the
  // pencil and offers no swap, because the padlock says they stay where they
  // are. See PlayerButton in CourtMatchup.
  const showPencil = interactive && (locked ? pencilOnly : selected);
  const showLock = interactive && !!onToggleLock;

  return (
    // The chip is the box the eye reads, and it holds two buttons: the name,
    // which selects as it always has, and the padlock under it. A padlock on a
    // court sits between the two names it holds together; here there is one
    // name, so it sits below it, still inside the box it belongs to.
    <div
      // The resting edge is the round's own line, so a chip reads as belonging
      // to the card it sits on. Selected keeps its blue and its ring: that is a
      // state you have put it in, and it has to stay tellable from the rest.
      // Locked takes the black edge a locked seat on a court wears.
      //
      // A swapped chip only names the two colours to fade from. The animation
      // outranks this inline edge for the two seconds it runs and then hands it
      // straight back, which is why nothing here has to be undone afterwards.
      style={
        {
          ...(selected || locked ? undefined : { borderColor: ROUND_EDGE }),
          ...(swapped
            ? {
                '--seat-swapped-from': ROUND_EDGE_SWAPPED,
                '--seat-swapped-fill': SITOUT_FILL_SWAPPED,
              }
            : undefined),
        } as React.CSSProperties
      }
      className={`inline-flex flex-col items-stretch rounded-md transition-colors ${
        swapped ? 'seat-swapped ' : ''
      }${
        locked
          ? 'bg-gray-100 border-2 border-black'
          : selected
            ? 'bg-blue-100 border border-blue-500 ring-2 ring-blue-500'
            : 'bg-gray-100 border hover:bg-gray-200'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (!interactive) return;
          if (locked) onLockedTap?.(slot);
          else onPlayerTap(slot);
        }}
        className={`inline-flex items-center gap-2 text-sm px-3 ${showLock ? 'pt-2 pb-0.5' : 'py-2'}${
          interactive ? '' : ' cursor-default'
        }`}
      >
        {/* The same size as a name on a court. They are the same thing, and one
            of them shrinking would read as the two meaning something different. */}
        <span className={`font-medium text-gray-900 ${PLAYER_NAME_TEXT}`}>
          {getDisplayName(player, allPlayers)}
        </span>
        {showPencil ? (
          <EditPlayerButton player={player} onOpen={onOpenPlayerMenu} />
        ) : (
          showRatings && <span className="text-gray-500">{player.rating.toFixed(1)}</span>
        )}
      </button>
      {showLock && (
        <button
          type="button"
          onClick={() => onToggleLock?.(roundIdx, player.id)}
          className="self-center mb-1 p-0.5 rounded hover:bg-gray-200 transition-colors"
          aria-label={locked ? 'Unlock sit-out' : 'Lock sit-out'}
          aria-pressed={locked}
        >
          <PadlockIcon locked={locked} />
        </button>
      )}
    </div>
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
  lockedIds,
  pencilSlot,
  onLockedTap,
  onToggleLock,
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
            locked={!!lockedIds?.includes(player.id)}
            pencilOnly={
              pencilSlot?.roundIdx === roundIdx && pencilSlot.sitOutIdx === sitOutIdx
            }
            onLockedTap={onLockedTap}
            onToggleLock={onToggleLock}
          />
        ))}
      </div>
    </div>
  );
}
