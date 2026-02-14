import { useState } from 'react';
import type { Schedule, Player } from '../../types';
import { RoundCard } from './RoundCard';
import { PartnerSummary } from './PartnerSummary';

export interface PlayerSlot {
  roundIdx: number;
  courtIdx: number;
  team: 'team1' | 'team2';
  playerIdx: number;
}

interface Props {
  schedule: Schedule;
  players: Player[];
  onRegenerate: () => void;
  onBack: () => void;
  onUpdateSchedule: (schedule: Schedule) => void;
}

export function SchedulePage({ schedule, players, onRegenerate, onBack, onUpdateSchedule }: Props) {
  const [selectedSlot, setSelectedSlot] = useState<PlayerSlot | null>(null);

  function handlePlayerTap(slot: PlayerSlot) {
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

  return (
    <div className="space-y-6 no-print">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          &larr; Back to Setup
        </button>
        <div className="flex gap-3">
          <button
            onClick={onRegenerate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Regenerate
          </button>
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
          />
          {selectedSlot?.roundIdx === roundIdx && (
            <p className="text-sm text-blue-600 text-center mt-2">
              Tap another player in this round to swap
            </p>
          )}
        </div>
      ))}

      <PartnerSummary schedule={schedule} players={players} />

      <div className="flex justify-end">
        <button
          onClick={onRegenerate}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}
