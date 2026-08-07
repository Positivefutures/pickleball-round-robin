import type { Player, Partnership } from '../../types';
import { resolvePairs } from '../../lib/partnerships';
import { PairList } from './PairList';

interface Props {
  players: Player[]; // the selected players only
  partnerships: Partnership[];
  pendingId: string | null;
  onTapPlayer: (id: string) => void;
  onUnpair: (id1: string, id2: string) => void;
}

export function PartnerPairing({
  players,
  partnerships,
  pendingId,
  onTapPlayer,
  onUnpair,
}: Props) {
  const byId = new Map(players.map((p) => [p.id, p]));

  // Only partnerships whose members are both currently selected are shown.
  const pairs = resolvePairs(partnerships, players);

  const pairedIds = new Set(pairs.flatMap((pr) => [pr.p1.id, pr.p2.id]));
  const unpaired = players
    .filter((p) => !pairedIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="mb-3">
        <h3 className="text-[1.35rem] font-extrabold text-[#222]">
          Set Partners
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Tap one player, then tap their partner to link them together for the whole
          session. Tap the broken-link icon to separate a pair.
        </p>
      </div>

      {players.length === 0 && (
        <p className="text-sm text-gray-500">
          No players selected yet. Go back and select players first.
        </p>
      )}

      {/* Linked pairs, grouped at the top */}
      {pairs.length > 0 && (
        <div className="mb-4">
          <PairList pairs={pairs} onUnpair={onUnpair} />
        </div>
      )}

      {/* Unpaired selected players, tap to pair */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {unpaired.map((player) => {
          const isPending = pendingId === player.id;
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => onTapPlayer(player.id)}
              className={`flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-colors text-left ${
                isPending
                  ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="font-medium text-sm">{player.name}</span>
              <span className="text-xs text-gray-400">{player.gender}</span>
              <span className="text-xs text-gray-500 ml-auto">
                {player.rating.toFixed(1)}
              </span>
            </button>
          );
        })}
      </div>

      {pendingId && byId.has(pendingId) && (
        <p className="text-sm text-amber-700 text-center mt-3">
          Tap another player to pair with{' '}
          <span className="font-medium">{byId.get(pendingId)!.name}</span>, or tap them
          again to cancel.
        </p>
      )}
    </div>
  );
}
