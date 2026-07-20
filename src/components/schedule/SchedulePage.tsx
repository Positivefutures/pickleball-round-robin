import { useState } from 'react';
import type { Schedule, Player, LockedPair } from '../../types';
import { effectiveCourtCount } from '../../lib/pairing';
import { RoundCard } from './RoundCard';
import { PartnerSummary } from './PartnerSummary';
import { RemovePlayerDialog } from './RemovePlayerDialog';

export interface PlayerSlot {
  roundIdx: number;
  courtIdx: number;
  team: 'team1' | 'team2';
  playerIdx: number;
}

interface Props {
  schedule: Schedule;
  players: Player[];
  numCourts: number;
  completedThrough: number;
  canUncomplete: boolean;
  onRegenerate: (locks: Record<number, LockedPair[]>) => void;
  onBack: () => void;
  onUpdateSchedule: (schedule: Schedule) => void;
  onCompletedThroughChange: (value: number) => void;
  onRemovePlayer: (playerId: string) => void;
  onStartNewSession: () => void;
}

export function SchedulePage({
  schedule,
  players,
  numCourts,
  completedThrough,
  canUncomplete,
  onRegenerate,
  onBack,
  onUpdateSchedule,
  onCompletedThroughChange,
  onRemovePlayer,
  onStartNewSession,
}: Props) {
  const [selectedSlot, setSelectedSlot] = useState<PlayerSlot | null>(null);
  const [locks, setLocks] = useState<Record<number, LockedPair[]>>({});
  const [expandedCompleted, setExpandedCompleted] = useState<Set<number>>(new Set());
  const [removeCandidate, setRemoveCandidate] = useState<Player | null>(null);
  const [confirmingNewSession, setConfirmingNewSession] = useState(false);

  // Completion is sequential: checking round N marks rounds 1..N complete, and
  // unchecking it drops back to N-1. Only the highest completed round can be
  // unchecked, and only while no player has been removed.
  function handleToggleComplete(roundIdx: number) {
    const isComplete = roundIdx < completedThrough;
    if (isComplete) {
      if (!canUncomplete || roundIdx !== completedThrough - 1) return;
      onCompletedThroughChange(roundIdx);
    } else {
      onCompletedThroughChange(roundIdx + 1);
      setExpandedCompleted(new Set());
    }
    setSelectedSlot(null);
  }

  function handleToggleExpand(roundIdx: number) {
    setExpandedCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(roundIdx)) next.delete(roundIdx);
      else next.add(roundIdx);
      return next;
    });
  }

  function handleConfirmRemove() {
    if (!removeCandidate) return;
    onRemovePlayer(removeCandidate.id);
    setRemoveCandidate(null);
    setSelectedSlot(null);
  }

  function handleToggleLock(roundIdx: number, courtIdx: number, team: 'team1' | 'team2') {
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
    if (slot.roundIdx < completedThrough) return;

    if (!selectedSlot) {
      setSelectedSlot(slot);
      return;
    }

    // Same slot: deselect
    if (
      selectedSlot.roundIdx === slot.roundIdx &&
      selectedSlot.courtIdx === slot.courtIdx &&
      selectedSlot.team === slot.team &&
      selectedSlot.playerIdx === slot.playerIdx
    ) {
      setSelectedSlot(null);
      return;
    }

    // Different round: deselect
    if (selectedSlot.roundIdx !== slot.roundIdx) {
      setSelectedSlot(null);
      return;
    }

    // Swap players
    const newRounds = schedule.rounds.map((round, ri) => {
      if (ri !== slot.roundIdx) return round;
      const newCourts = round.courts.map((court) => ({
        ...court,
        team1: [...court.team1],
        team2: [...court.team2],
      }));

      const courtA = newCourts[selectedSlot.courtIdx];
      const courtB = newCourts[slot.courtIdx];
      const playerA = courtA[selectedSlot.team][selectedSlot.playerIdx];
      const playerB = courtB[slot.team][slot.playerIdx];

      courtA[selectedSlot.team][selectedSlot.playerIdx] = playerB;
      courtB[slot.team][slot.playerIdx] = playerA;

      // Recalculate ratingDiff for affected courts
      const recalc = (court: typeof courtA) => {
        const t1 = court.team1.reduce((s, p) => s + p.rating, 0);
        const t2 = court.team2.reduce((s, p) => s + p.rating, 0);
        court.ratingDiff = Math.abs(t1 - t2);
      };
      recalc(courtA);
      if (slot.courtIdx !== selectedSlot.courtIdx) {
        recalc(courtB);
      }

      return { ...round, courts: newCourts };
    });

    onUpdateSchedule({ rounds: newRounds });
    setSelectedSlot(null);
  }

  function handleRegenerate() {
    onRegenerate(locks);
  }

  function handleBack() {
    setLocks({}); // clear all locks when going back to setup
    onBack();
  }

  const hasLocks = Object.keys(locks).length > 0;
  const allComplete = completedThrough >= schedule.rounds.length;

  // Courts in play right now vs. what would remain after the pending removal.
  const currentCourts = effectiveCourtCount(players.length, numCourts);
  const nextCourts = effectiveCourtCount(players.length - 1, numCourts);

  return (
    <div className="space-y-6 no-print">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex gap-3">
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            &larr; Back to Setup
          </button>
          <button
            onClick={() => setConfirmingNewSession(true)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            Start New Session
          </button>
        </div>
        <div className="flex gap-3">
          {!allComplete && (
            <button
              onClick={handleRegenerate}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              {hasLocks ? 'Reshuffle' : 'Regenerate'}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {schedule.rounds.map((round, roundIdx) => (
        <div key={round.roundNumber}>
          <RoundCard
            round={round}
            roundIdx={roundIdx}
            selectedSlot={selectedSlot}
            onPlayerTap={handlePlayerTap}
            allPlayers={players}
            locks={locks[roundIdx] || []}
            onToggleLock={handleToggleLock}
            onRequestRemove={setRemoveCandidate}
            isComplete={roundIdx < completedThrough}
            isExpanded={expandedCompleted.has(roundIdx)}
            canUncomplete={canUncomplete && roundIdx === completedThrough - 1}
            onToggleComplete={() => handleToggleComplete(roundIdx)}
            onToggleExpand={() => handleToggleExpand(roundIdx)}
          />
          {selectedSlot?.roundIdx === roundIdx && (
            <p className="text-sm text-blue-600 text-center mt-2">
              Tap another player to swap, or tap the trash icon to remove them
            </p>
          )}
        </div>
      ))}

      <PartnerSummary schedule={schedule} players={players} />

      {!allComplete && (
        <div className="flex justify-end">
          <button
            onClick={handleRegenerate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            {hasLocks ? 'Reshuffle' : 'Regenerate'}
          </button>
        </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 mx-4 max-w-sm w-full">
            <p className="text-gray-800 text-center font-medium mb-2">Start a new session?</p>
            <p className="text-sm text-gray-600 text-center mb-4">
              This clears the current schedule and its completed rounds. Your groups are kept.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingNewSession(false)}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmingNewSession(false);
                  onStartNewSession();
                }}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
              >
                Yes, Start New
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
