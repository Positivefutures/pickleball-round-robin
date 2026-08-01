import type { Player } from '../../types';

interface Props {
  pairs: { p1: Player; p2: Player }[];
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

// The linked pairs, each with a button to break the link. Shared by the pairing
// screen and the summary shown above the player list once pairing is done.
export function PairList({ pairs, onUnpair }: Props) {
  return (
    <div className="space-y-2">
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
  );
}
