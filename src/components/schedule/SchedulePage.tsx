import { useEffect, useState } from 'react';
import type { Schedule, Player, LockedPair, Partnership, Round } from '../../types';
import { effectiveCourtCount } from '../../lib/pairing';
import { arePartners, partnerKey } from '../../lib/partnerships';
import { renumberFrom } from '../../lib/courtNumbers';
import { RoundCard } from './RoundCard';
import { PartnerSummary } from './PartnerSummary';
import { RemovePlayerDialog } from './RemovePlayerDialog';
import { AddPlayerDialog } from './AddPlayerDialog';
import { CourtNumberDialog } from './CourtNumberDialog';
import { DiscardScheduleDialog } from './DiscardScheduleDialog';
import { SwapHint } from './SwapHint';
import { ShuffleIcon } from './icons';

export interface CourtSlot {
  kind: 'court';
  roundIdx: number;
  courtIdx: number;
  team: 'team1' | 'team2';
  playerIdx: number;
}

export interface SitOutSlot {
  kind: 'sitout';
  roundIdx: number;
  sitOutIdx: number;
}

export type PlayerSlot = CourtSlot | SitOutSlot;

function sameSlot(a: PlayerSlot, b: PlayerSlot): boolean {
  if (a.kind !== b.kind || a.roundIdx !== b.roundIdx) return false;
  if (a.kind === 'court' && b.kind === 'court') {
    return a.courtIdx === b.courtIdx && a.team === b.team && a.playerIdx === b.playerIdx;
  }
  if (a.kind === 'sitout' && b.kind === 'sitout') {
    return a.sitOutIdx === b.sitOutIdx;
  }
  return false;
}

interface Props {
  schedule: Schedule;
  players: Player[];
  partnerships: Partnership[];
  numCourts: number;
  completedRounds: number[];
  canUncomplete: boolean;
  // Set once the host has swapped players or removed someone from this schedule.
  scheduleEdited: boolean;
  onRegenerate: (
    locks: Record<number, LockedPair[]>,
    brokenPairs: Record<number, string[]>
  ) => void;
  onUpdateSchedule: (schedule: Schedule) => void;
  onCompletedRoundsChange: (value: number[]) => void;
  onRemovePlayer: (playerId: string) => void;
  onStartNewSession: () => void;
  /**
   * Whether leaving this schedule would throw work away. The step tabs sit
   * above this page and are the only way off it, and only this page knows about
   * the locks and broken couples that count towards it.
   */
  onUnsavedWorkChange: (atStake: boolean) => void;
  /** False once the host has closed the swap hint, which is remembered for good. */
  showSwapHint: boolean;
  onDismissSwapHint: () => void;
  /** Group members not in this session yet, offered by Add Player. */
  addablePlayers: Player[];
  onAddPlayer: (playerId: string) => void;
}

// The padlocks shown for a round: every intact (non-broken) couple found in the
// round's current team assignments, read live so they stay correct across
// reshuffles and manual swaps.
function partnershipLocksForRound(
  round: Round,
  partnerships: Partnership[],
  broken: Set<string>
): LockedPair[] {
  const result: LockedPair[] = [];
  round.courts.forEach((court, courtIdx) => {
    (['team1', 'team2'] as const).forEach((team) => {
      const t = court[team];
      if (
        t.length === 2 &&
        arePartners(t[0].id, t[1].id, partnerships) &&
        !broken.has(partnerKey(t[0].id, t[1].id))
      ) {
        result.push({ player1Id: t[0].id, player2Id: t[1].id, courtIdx, team });
      }
    });
  });
  return result;
}

export function SchedulePage({
  schedule,
  players,
  partnerships,
  numCourts,
  completedRounds,
  canUncomplete,
  scheduleEdited,
  onRegenerate,
  onUpdateSchedule,
  onCompletedRoundsChange,
  onRemovePlayer,
  onStartNewSession,
  onUnsavedWorkChange,
  showSwapHint,
  onDismissSwapHint,
  addablePlayers,
  onAddPlayer,
}: Props) {
  const [selectedSlot, setSelectedSlot] = useState<PlayerSlot | null>(null);
  const [locks, setLocks] = useState<Record<number, LockedPair[]>>({});
  // Couples the host has broken for a specific round (partnerKeys by round index).
  const [brokenPairs, setBrokenPairs] = useState<Record<number, string[]>>({});
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [removeCandidate, setRemoveCandidate] = useState<Player | null>(null);
  const [confirmingNewSession, setConfirmingNewSession] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  // Which court is being renamed, by the round it was opened from.
  const [editingCourt, setEditingCourt] = useState<{ roundIdx: number; courtIdx: number } | null>(
    null
  );

  const hasPartnerships = partnerships.length > 0;
  const completedSet = new Set(completedRounds);

  // Completion is an arbitrary set: any round can be toggled independently, and
  // completed rounds group at the top of the list. Unchecking is allowed only
  // until a player has been removed (which regenerates the remaining rounds).
  function handleToggleComplete(roundNumber: number) {
    if (completedSet.has(roundNumber)) {
      if (!canUncomplete) return;
      onCompletedRoundsChange(completedRounds.filter((n) => n !== roundNumber));
    } else {
      onCompletedRoundsChange([...completedRounds, roundNumber]);
    }
    setSelectedSlot(null);
  }

  function handleToggleExpand(roundNumber: number) {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(roundNumber)) next.delete(roundNumber);
      else next.add(roundNumber);
      return next;
    });
  }

  // Renaming a court runs forwards from the round it was done at, and stops at
  // nothing behind it. See lib/courtNumbers.ts for why.
  function handleCourtNumberDone(courtNumber: number) {
    if (!editingCourt) return;
    onUpdateSchedule({
      rounds: renumberFrom(
        schedule.rounds, editingCourt.roundIdx, editingCourt.courtIdx, courtNumber,
        completedRounds
      ),
    });
    setEditingCourt(null);
  }

  function handleConfirmRemove() {
    if (!removeCandidate) return;
    onRemovePlayer(removeCandidate.id);
    setRemoveCandidate(null);
    setSelectedSlot(null);
  }

  function handleToggleLock(roundIdx: number, courtIdx: number, team: 'team1' | 'team2') {
    const teamPlayers = schedule.rounds[roundIdx].courts[courtIdx][team];

    // In partnership mode the lock icon on a couple breaks (or re-links) them for
    // this round only. Non-couple teams fall through to the ad-hoc lock behaviour.
    if (
      hasPartnerships &&
      teamPlayers.length === 2 &&
      arePartners(teamPlayers[0].id, teamPlayers[1].id, partnerships)
    ) {
      const key = partnerKey(teamPlayers[0].id, teamPlayers[1].id);
      setBrokenPairs((prev) => {
        const roundBroken = prev[roundIdx] || [];
        const isBroken = roundBroken.includes(key);
        const nextRound = isBroken
          ? roundBroken.filter((k) => k !== key)
          : [...roundBroken, key];
        const next = { ...prev };
        if (nextRound.length === 0) delete next[roundIdx];
        else next[roundIdx] = nextRound;
        return next;
      });
      setSelectedSlot(null);
      return;
    }

    setLocks((prev) => {
      const roundLocks = prev[roundIdx] || [];
      const existingIdx = roundLocks.findIndex(
        (lp) => lp.courtIdx === courtIdx && lp.team === team
      );

      if (existingIdx >= 0) {
        // Unlock
        const newRoundLocks = roundLocks.filter((_, i) => i !== existingIdx);
        const newLocks = { ...prev };
        if (newRoundLocks.length === 0) {
          delete newLocks[roundIdx];
        } else {
          newLocks[roundIdx] = newRoundLocks;
        }
        return newLocks;
      } else {
        // Lock: capture current player IDs
        const round = schedule.rounds[roundIdx];
        const court = round.courts[courtIdx];
        const teamPlayers = court[team];
        if (teamPlayers.length !== 2) return prev;

        const newLock: LockedPair = {
          player1Id: teamPlayers[0].id,
          player2Id: teamPlayers[1].id,
          courtIdx,
          team,
        };
        return {
          ...prev,
          [roundIdx]: [...roundLocks, newLock],
        };
      }
    });
    // Deselect any swap selection when toggling a lock
    setSelectedSlot(null);
  }

  function handlePlayerTap(slot: PlayerSlot) {
    // Completed rounds are frozen — guard here too so a stale selection can't
    // mutate one after it's been marked complete.
    if (completedSet.has(schedule.rounds[slot.roundIdx].roundNumber)) return;

    if (!selectedSlot) {
      setSelectedSlot(slot);
      return;
    }

    // Same slot: deselect
    if (sameSlot(selectedSlot, slot)) {
      setSelectedSlot(null);
      return;
    }

    // Different round: deselect
    if (selectedSlot.roundIdx !== slot.roundIdx) {
      setSelectedSlot(null);
      return;
    }

    // Two sit-outs can't swap (both stay out) — just move the selection to the
    // newly tapped one, ready to pair with a court player.
    if (selectedSlot.kind === 'sitout' && slot.kind === 'sitout') {
      setSelectedSlot(slot);
      return;
    }

    const from = selectedSlot;
    const newRounds = schedule.rounds.map((round, ri) => {
      if (ri !== slot.roundIdx) return round;

      const newCourts = round.courts.map((court) => ({
        ...court,
        team1: [...court.team1],
        team2: [...court.team2],
      }));
      const newSitOuts = [...round.sitOuts];

      const read = (s: PlayerSlot): Player =>
        s.kind === 'court'
          ? newCourts[s.courtIdx][s.team][s.playerIdx]
          : newSitOuts[s.sitOutIdx];
      const write = (s: PlayerSlot, p: Player) => {
        if (s.kind === 'court') newCourts[s.courtIdx][s.team][s.playerIdx] = p;
        else newSitOuts[s.sitOutIdx] = p;
      };

      const playerA = read(from);
      const playerB = read(slot);
      write(from, playerB);
      write(slot, playerA);

      // Recalculate ratingDiff for any court touched by the swap
      const recalc = (court: (typeof newCourts)[number]) => {
        const t1 = court.team1.reduce((s, p) => s + p.rating, 0);
        const t2 = court.team2.reduce((s, p) => s + p.rating, 0);
        court.ratingDiff = Math.abs(t1 - t2);
      };
      for (const s of [from, slot]) {
        if (s.kind === 'court') recalc(newCourts[s.courtIdx]);
      }

      return { ...round, courts: newCourts, sitOuts: newSitOuts };
    });

    onUpdateSchedule({ rounds: newRounds });
    setSelectedSlot(null);
  }

  function handleRegenerate() {
    onRegenerate(locks, brokenPairs);
  }

  // Everything that leaving this schedule would throw away. On an untouched one
  // there is nothing to lose, so a tab goes straight through rather than
  // nagging about a schedule the host can recreate with one tap.
  const hasUnsavedWork =
    scheduleEdited ||
    completedRounds.length > 0 ||
    Object.keys(locks).length > 0 ||
    Object.keys(brokenPairs).length > 0;

  // The tabs above this page do the asking, so App has to be told the answer.
  // Only read while this page is mounted.
  useEffect(() => {
    onUnsavedWorkChange(hasUnsavedWork);
  }, [hasUnsavedWork, onUnsavedWorkChange]);

  const allComplete = completedSet.size >= schedule.rounds.length;

  // Completed rounds group at the top (numeric order), then the rest — while
  // each round keeps its original index for swaps and its original "Round N".
  const orderedRounds = schedule.rounds
    .map((round, roundIdx) => ({ round, roundIdx, complete: completedSet.has(round.roundNumber) }))
    .sort((a, b) => Number(b.complete) - Number(a.complete)); // stable: keeps numeric order within each group

  // Courts in play right now vs. what would remain after the pending removal.
  const currentCourts = effectiveCourtCount(players.length, numCourts);
  const nextCourts = effectiveCourtCount(players.length - 1, numCourts);

  // Add Player lands on the earliest round still to be played — one button, not
  // one per round, since adding affects every unplayed round alike. Keyed off
  // the original index because completed rounds are re-sorted for display.
  const firstOpenIdx = schedule.rounds.findIndex((r) => !completedSet.has(r.roundNumber));
  const canAddPlayer = firstOpenIdx !== -1 && addablePlayers.length > 0;

  const addPlayerButton = (
    <button
      type="button"
      onClick={() => setAddingPlayer(true)}
      className="no-print shrink-0 whitespace-nowrap rounded-md border border-[#999] bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300"
    >
      + Add Player
    </button>
  );

  return (
    <div className="space-y-6 no-print">
      {/* Reshuffle and New Session. Going back is the Setup tab's job, and
          printing lives on the header's printer button. Both sit to the right,
          matching the Reshuffle at the foot of the page, so New Session stays
          put when Reshuffle drops out on the last completed round. */}
      {/* Never wraps: the New Session label shortens instead. 0.9em rather than a
          fixed size so the 10% reduction still tracks large-text mode. */}
      <div className="flex flex-nowrap justify-end items-center gap-3">
        {!allComplete && (
          <button
            onClick={handleRegenerate}
            className="inline-flex shrink-0 whitespace-nowrap items-center gap-2 px-4 py-2 text-[0.9em] bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            <ShuffleIcon />
            Reshuffle
          </button>
        )}
        <button
          onClick={() => setConfirmingNewSession(true)}
          aria-label="Start a new session"
          className="shrink-0 whitespace-nowrap px-4 py-2 text-[0.9em] border border-[#999] bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          <span className="session-long hidden min-[430px]:inline">New Session</span>
          <span className="session-short min-[430px]:hidden">New</span>
        </button>
      </div>

      {/* Completed rounds are frozen, so once they all are there is nothing to
          swap and nothing to say. */}
      {showSwapHint && !allComplete && <SwapHint onDismiss={onDismissSwapHint} />}

      {orderedRounds.map(({ round, roundIdx, complete }) => {
        // Show ad-hoc locks plus every intact couple in this round (deduped by
        // court+team so a couple never renders as two overlapping locks).
        const manualLocks = locks[roundIdx] || [];
        const partnerLocks = hasPartnerships
          ? partnershipLocksForRound(
              round, partnerships, new Set(brokenPairs[roundIdx] || [])
            )
          : [];
        const seen = new Set(partnerLocks.map((lp) => `${lp.courtIdx}-${lp.team}`));
        const roundLocks = [
          ...partnerLocks,
          ...manualLocks.filter((lp) => !seen.has(`${lp.courtIdx}-${lp.team}`)),
        ];
        return (
        <div key={round.roundNumber}>
          <RoundCard
            round={round}
            roundIdx={roundIdx}
            selectedSlot={selectedSlot}
            onPlayerTap={handlePlayerTap}
            allPlayers={players}
            locks={roundLocks}
            onToggleLock={handleToggleLock}
            onRequestRemove={setRemoveCandidate}
            isComplete={complete}
            isExpanded={expandedRounds.has(round.roundNumber)}
            canUncomplete={canUncomplete}
            onToggleComplete={() => handleToggleComplete(round.roundNumber)}
            onToggleExpand={() => handleToggleExpand(round.roundNumber)}
            onEditCourtNumber={(courtIdx) => setEditingCourt({ roundIdx, courtIdx })}
            sitOutAction={
              canAddPlayer && roundIdx === firstOpenIdx ? addPlayerButton : undefined
            }
          />
          {selectedSlot?.roundIdx === roundIdx && (
            <p className="text-sm text-blue-600 text-center mt-2">
              Tap another player to swap, or tap the trash icon to remove them
            </p>
          )}
        </div>
        );
      })}

      <PartnerSummary schedule={schedule} players={players} />

      {!allComplete && (
        <div className="flex justify-end">
          <button
            onClick={handleRegenerate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            <ShuffleIcon />
            Reshuffle
          </button>
        </div>
      )}

      {addingPlayer && (
        <AddPlayerDialog
          candidates={addablePlayers}
          allPlayers={players}
          onConfirm={(playerId) => {
            setAddingPlayer(false);
            setSelectedSlot(null);
            onAddPlayer(playerId);
          }}
          onCancel={() => setAddingPlayer(false)}
        />
      )}

      {editingCourt && schedule.rounds[editingCourt.roundIdx]?.courts[editingCourt.courtIdx] && (
        <CourtNumberDialog
          courtNumber={
            schedule.rounds[editingCourt.roundIdx].courts[editingCourt.courtIdx].courtNumber
          }
          roundNumber={schedule.rounds[editingCourt.roundIdx].roundNumber}
          onDone={handleCourtNumberDone}
          onCancel={() => setEditingCourt(null)}
        />
      )}

      {removeCandidate && (
        <RemovePlayerDialog
          player={removeCandidate}
          currentCourts={currentCourts}
          nextCourts={nextCourts}
          remainingCount={players.length - 1}
          onConfirm={handleConfirmRemove}
          onCancel={() => setRemoveCandidate(null)}
        />
      )}

      {confirmingNewSession && (
        <DiscardScheduleDialog
          heading="Start a new session?"
          cancelLabel="Cancel"
          confirmLabel="Yes, Start New"
          onConfirm={() => {
            setConfirmingNewSession(false);
            onStartNewSession();
          }}
          onCancel={() => setConfirmingNewSession(false)}
        />
      )}
    </div>
  );
}
