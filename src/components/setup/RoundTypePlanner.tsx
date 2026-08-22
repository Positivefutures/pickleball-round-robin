import { useCallback, useId, useMemo, useState } from 'react';
import type { RoundPlan, RoundType } from '../../types';
import { moveRound, planAt, setPlanType } from '../../lib/roundPlan';
import { NORMAL_ROUND_META, ROUND_TYPE_META } from '../../lib/roundTypes';
import { useListReorder } from '../../hooks/useListReorder';
import { useScrollLock } from '../../hooks/useScrollLock';
import { RoundPlanRow } from './RoundPlanRow';
import { RoundTypePicker } from './RoundTypePicker';

/**
 * The Set Round Types list: one row per round, and what each round is played as.
 *
 * It holds a **draft**. Every pill tap and every drag touches that and nothing
 * else, and Done is the only thing that hands a plan back. The reason is in
 * App.tsx's handlePlanCommit: the schedule's basis is recomputed every render,
 * so writing each tap straight through would drop the Schedule tab out of the
 * tabs the host can reach and put it back a moment later. They would watch
 * their tab blink while they were choosing.
 *
 * The round number stays with the position. The list always reads ROUND 1 to N
 * top to bottom; dragging moves the *type* into a different round, which is a
 * permutation of the plan and never a renumbering. That is also what lets a
 * round already played sit in the list, locked, without the rounds around it
 * having to shuffle past it.
 */

interface Props {
  numRounds: number;
  /** The committed plan. Seeds the draft, once, on mount. */
  plan: RoundPlan;
  /** Rounds already played: no handle, no pill, and nothing moves through them. */
  lockedRounds: number[];
  /**
   * The draft as it stands, every time it changes. Not a commit — nothing acts
   * on it. Reset All sits outside this list, on the title line, and this is how
   * it can tell whether there is anything on screen left to reset.
   */
  onDraftChange?: (next: RoundPlan) => void;
  onCommit: (next: RoundPlan) => void;
}

function nameOf(type: RoundType | null): string {
  return type ? ROUND_TYPE_META[type].shortName : NORMAL_ROUND_META.shortName;
}

export function RoundTypePlanner({
  numRounds,
  plan,
  lockedRounds,
  onDraftChange,
  onCommit,
}: Props) {
  const [draft, setDraft] = useState<RoundPlan>(plan);
  const [pickerRound, setPickerRound] = useState<number | null>(null);
  /** What just happened, for anybody who cannot see the list move. */
  const [announcement, setAnnouncement] = useState('');
  const hintId = useId();

  /** The one way the draft changes, so the line above never goes unsaid. */
  const change = useCallback(
    (next: RoundPlan) => {
      setDraft(next);
      onDraftChange?.(next);
    },
    [onDraftChange]
  );

  useScrollLock(pickerRound !== null);

  const locked = useMemo(
    // Filtered to the rounds on screen: shortening the session must not leave a
    // lock on a row nobody is looking at.
    () => new Set(lockedRounds.filter((n) => n >= 1 && n <= numRounds)),
    [lockedRounds, numRounds]
  );

  const handleMove = useCallback(
    (from: number, to: number) => {
      const fromRound = from + 1;
      const toRound = to + 1;
      // Named for what moved, not for where it went: the rows are numbered 1..N
      // whatever happens, so "Round 2 moved to Round 3" would say nothing.
      setAnnouncement(`${nameOf(planAt(draft, fromRound))} moved to Round ${toRound}.`);
      change(moveRound(draft, fromRound, toRound, numRounds, locked));
    },
    [change, draft, locked, numRounds]
  );

  const { dragging, handleProps, rowProps } = useListReorder({
    count: numRounds,
    disabled: (i) => locked.has(i + 1),
    onMove: handleMove,
  });

  const pick = useCallback(
    (type: RoundType | null) => {
      if (pickerRound === null) return;
      change(setPlanType(draft, pickerRound, type));
      setAnnouncement(`Round ${pickerRound} set to ${nameOf(type)}.`);
      setPickerRound(null);
    },
    [change, draft, pickerRound]
  );

  const rounds = Array.from({ length: numRounds }, (_, i) => i + 1);

  return (
    <div className="mt-3">
      <p id={hintId} className="sr-only">
        Press the up and down arrow keys to move this round.
      </p>

      <div className="space-y-2">
        {rounds.map((n, i) => {
          const isLocked = locked.has(n);
          const row = rowProps(i);
          return (
            <RoundPlanRow
              key={n}
              roundNumber={n}
              type={planAt(draft, n)}
              locked={isLocked}
              dragging={dragging === i}
              hintId={hintId}
              rowRef={row.ref}
              rowStyle={row.style}
              handleProps={isLocked ? undefined : handleProps(i)}
              onOpenPicker={() => setPickerRound(n)}
            />
          );
        })}
      </div>

      {lockedRounds.some((n) => n >= 1 && n <= numRounds) && (
        <p className="mt-2 text-xs text-gray-600">
          Rounds already played keep what they were played as.
        </p>
      )}

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <button
        type="button"
        onClick={() => onCommit(draft)}
        className="mt-3 w-full rounded-md border border-[#999] bg-gray-100 px-4 py-2.5 font-bold text-gray-700 transition-colors hover:bg-gray-200"
      >
        Done
      </button>

      {pickerRound !== null && (
        <RoundTypePicker
          roundNumber={pickerRound}
          current={planAt(draft, pickerRound)}
          onPick={pick}
          onClose={() => setPickerRound(null)}
        />
      )}
    </div>
  );
}
