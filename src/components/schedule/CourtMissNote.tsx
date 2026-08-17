import { useId, useState } from 'react';
import { ChevronDownIcon } from '../icons';

/**
 * Why a court is not playing the round's format, under the court it is about.
 *
 * A headline and a fold. The line the host needs at a glance is that the last
 * game could not be made gendered; the arithmetic behind it — four men or four
 * women, and the three and three left over — is a sentence they read once, if
 * at all, and it was sitting under every card that missed.
 *
 * Shut every time it is drawn. This is an aside on a card the host is reading
 * for its names, and a fold that remembers being opened three rounds ago would
 * be back to a wall of sentences.
 *
 * Off the printout, as the sentence was: paper carries the schedule, not the
 * app explaining itself.
 */
export function CourtMissNote({ headline, reason }: { headline: string; reason: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="no-print mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-1 text-left text-sm font-bold text-white transition-colors hover:text-white/75"
      >
        {headline}
        {/* Turned over rather than swapped for an up arrow, so the fold reads as
            one control moving and not as two states of a different thing. */}
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <p id={id} className="mt-1 text-sm font-medium text-white">
          {reason}
        </p>
      )}
    </div>
  );
}
