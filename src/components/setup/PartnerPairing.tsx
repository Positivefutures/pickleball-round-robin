import type { Player, Partnership } from '../../types';

interface Props {
  players: Player[]; // the selected players only
  partnerships: Partnership[];
  pendingId: string | null;
  onTapPlayer: (id: string) => void;
  onUnpair: (id1: string, id2: string) => void;
}

// A chain-link glyph shown between two paired players.
function LinkIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

// A broken-link glyph for the "unlink" button.
function UnlinkIcon() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M5.17 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      <line x1="8" y1="2" x2="8" y2="5" />
      <line x1="2" y1="8" x2="5" y2="8" />
      <line x1="16" y1="19" x2="16" y2="22" />
      <line x1="19" y1="16" x2="22" y2="16" />
    </svg>
  );
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
  const pairs = partnerships
    .map((pr) => ({ p1: byId.get(pr.player1Id), p2: byId.get(pr.player2Id) }))
    .filter((pr): pr is { p1: Player; p2: Player } => !!pr.p1 && !!pr.p2);

  const pairedIds = new Set(pairs.flatMap((pr) => [pr.p1.id, pr.p2.id]));
  const unpaired = players
    .filter((p) => !pairedIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="mb-3">
        <h3 className="font-medium text-gray-700">
          Set Partners ({pairs.length} {pairs.length === 1 ? 'pair' : 'pairs'})
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
        <div className="space-y-2 mb-4">
          {pairs.map(({ p1, p2 }) => (
            <div
              key={`${p1.id}|${p2.id}`}
              className="flex items-center gap-2 p-2.5 rounded-md border border-indigo-300 bg-indigo-50"
            >
              <span className="font-medium text-sm">{p1.name}</span>
              <span className="text-indigo-500">
                <LinkIcon />
              </span>
              <span className="font-medium text-sm">{p2.name}</span>
              <button
                type="button"
                onClick={() => onUnpair(p1.id, p2.id)}
                aria-label={`Separate ${p1.name} and ${p2.name}`}
                className="ml-auto text-indigo-400 hover:text-red-600 transition-colors p-1"
              >
                <UnlinkIcon />
              </button>
            </div>
          ))}
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
