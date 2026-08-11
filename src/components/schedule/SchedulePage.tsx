import { useEffect, useState } from 'react';
import type { Schedule, Player, LockedPair, Partnership, Round, CourtScore } from '../../types';
import { effectiveCourtCount } from '../../lib/pairing';
import { arePartners, partnerKey } from '../../lib/partnerships';
import { renumberFrom } from '../../lib/courtNumbers';
import { courtRatingDiff } from '../../utils/helpers';
import { RoundCard } from './RoundCard';
import { PartnerSummary } from './PartnerSummary';
import { RemovePlayerDialog } from './RemovePlayerDialog';
import { CourtNumberDialog } from './CourtNumberDialog';
import { ScoreDialog } from './ScoreDialog';
import { StandingsPanel } from './StandingsPanel';
import { SwapHint } from './SwapHint';
import { ActionsButton } from './ActionsButton';
import { ActionsSheet, type ActionsEntry, type ScheduleActions } from './ActionsSheet';

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

/**
 * A place on a court with nobody in it. A team holds at most two players, so an
 * empty place is simply a team with fewer than two, and it needs no index of its
 * own — the player joining is pushed onto the end.
 */
export interface EmptySlot {
  kind: 'empty';
  roundIdx: number;
  courtIdx: number;
  team: 'team1' | 'team2';
}

export type PlayerSlot = CourtSlot | SitOutSlot | EmptySlot;

function sameSlot(a: PlayerSlot, b: PlayerSlot): boolean {
  if (a.kind !== b.kind || a.roundIdx !== b.roundIdx) return false;
  if (a.kind === 'court' && b.kind === 'court') {
    return a.courtIdx === b.courtIdx && a.team === b.team && a.playerIdx === b.playerIdx;
  }
  if (a.kind === 'sitout' && b.kind === 'sitout') {
    return a.sitOutIdx === b.sitOutIdx;
  }
  if (a.kind === 'empty' && b.kind === 'empty') {
    return a.courtIdx === b.courtIdx && a.team === b.team;
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
  /**
   * Everything behind the Actions button, less the reshuffle. That one is put
   * together here, because the padlocks and broken couples it has to honour are
   * this page's own state and go no further.
   */
  actions: Omit<ScheduleActions, 'onReshuffle'>;
  defaultRating: number;
  /** Whether this session keeps score: the boards and the standings table. */
  scoringEnabled: boolean;
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
  onUnsavedWorkChange,
  showSwapHint,
  onDismissSwapHint,
  addablePlayers,
  actions,
  defaultRating,
  scoringEnabled,
}: Props) {
  const [selectedSlot, setSelectedSlot] = useState<PlayerSlot | null>(null);
  const [locks, setLocks] = useState<Record<number, LockedPair[]>>({});
  // Couples the host has broken for a specific round (partnerKeys by round index).
  const [brokenPairs, setBrokenPairs] = useState<Record<number, string[]>>({});
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [removeCandidate, setRemoveCandidate] = useState<Player | null>(null);
  // Which view the Actions sheet opens on, or null while it is closed. The
  // counter keys the sheet, so opening it always gets a fresh one: it flashes a
  // confirmation and closes itself, and a second tap during that flash should
  // show the grid rather than the tail end of the last thing done.
  const [actionsEntry, setActionsEntry] = useState<ActionsEntry | null>(null);
  const [actionsOpened, setActionsOpened] = useState(0);

  // Which court is being renamed, by the round it was opened from.
  const [editingCourt, setEditingCourt] = useState<{ roundIdx: number; courtIdx: number } | null>(
    null
  );

  // Which court is being scored. Same shape, and open on a completed round too.
  const [scoringCourt, setScoringCourt] = useState<{ roundIdx: number; courtIdx: number } | null>(
    null
  );

  function openActions(entry: ActionsEntry) {
    setActionsEntry(entry);
    setActionsOpened((n) => n + 1);
  }

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

  /**
   * Writing a score down, or taking one back.
   *
   * Goes out through onUpdateSchedule like every other change to a schedule,
   * rather than getting a route of its own. One seam is what lets a session be
   * published from one place later.
   */
  function handleScoreDone(score: CourtScore | null) {
    if (!scoringCourt) return;
    const { roundIdx, courtIdx } = scoringCourt;
    onUpdateSchedule({
      rounds: schedule.rounds.map((round, ri) => {
        if (ri !== roundIdx) return round;
        return {
          ...round,
          courts: round.courts.map((court, ci) => {
            if (ci !== courtIdx) return court;
            if (score === null) {
              if (court.score === undefined) return court;
              // Deleted rather than zeroed, so an unscored court is a court with
              // no score and the board goes back to its dashes.
              const next = { ...court };
              delete next.score;
              return next;
            }
            return { ...court, score };
          }),
        };
      }),
    });
    setScoringCourt(null);
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

  /**
   * Somebody steps into an empty place.
   *
   * Coming off the bench, they simply join and the empty place is gone — it does
   * not move to the sit-out line, because a place on a court is not a person.
   * Coming off another court, the empty place goes back the way they came, which
   * is what makes it a swap.
   *
   * A player may only leave a place if their team keeps somebody, and may only
   * leave their court if it is full. Otherwise a tap could stand somebody on a
   * court on their own, or put two players on one side against nobody.
   */
  function fillEmptyPlace(empty: EmptySlot, mover: CourtSlot | SitOutSlot) {
    const round = schedule.rounds[empty.roundIdx];

    if (mover.kind === 'court') {
      const fromCourt = round.courts[mover.courtIdx];
      const courtSize = fromCourt.team1.length + fromCourt.team2.length;
      const sameCourt = mover.courtIdx === empty.courtIdx;
      if (fromCourt[mover.team].length < 2 || (!sameCourt && courtSize < 4)) {
        // Nothing doing. Move the selection rather than leaving a dead tap.
        setSelectedSlot(mover);
        return;
      }
    }

    const player =
      mover.kind === 'court'
        ? round.courts[mover.courtIdx][mover.team][mover.playerIdx]
        : round.sitOuts[mover.sitOutIdx];
    if (!player) {
      setSelectedSlot(null);
      return;
    }

    // This round and no other. A round with one place spare fills itself when the
    // player is added, so a tap is only ever needed where there is more than one
    // place to choose between — and a choice made about this round says nothing
    // about who should partner whom in the next.
    const newRounds = schedule.rounds.map((r, ri) => {
      if (ri !== empty.roundIdx) return r;

      const courts = r.courts.map((c) => ({
        ...c,
        team1: [...c.team1],
        team2: [...c.team2],
      }));
      const sitOuts = [...r.sitOuts];
      const touched: number[] = [];

      if (mover.kind === 'court') {
        courts[mover.courtIdx][mover.team].splice(mover.playerIdx, 1);
        touched.push(mover.courtIdx);
      } else {
        sitOuts.splice(mover.sitOutIdx, 1);
      }
      courts[empty.courtIdx][empty.team].push(player);
      touched.push(empty.courtIdx);

      for (const c of touched) {
        courts[c].ratingDiff = courtRatingDiff(courts[c].team1, courts[c].team2);
      }
      return { ...r, courts, sitOuts };
    });

    onUpdateSchedule({ rounds: newRounds });
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

    // Neither can two empty places, which have nothing to give each other.
    if (selectedSlot.kind === 'empty' && slot.kind === 'empty') {
      setSelectedSlot(slot);
      return;
    }

    // One of the pair is an empty place: somebody is moving into it rather than
    // two players changing ends.
    if (selectedSlot.kind === 'empty' || slot.kind === 'empty') {
      const empty = (selectedSlot.kind === 'empty' ? selectedSlot : slot) as EmptySlot;
      const mover = selectedSlot.kind === 'empty' ? slot : selectedSlot;
      fillEmptyPlace(empty, mover as CourtSlot | SitOutSlot);
      return;
    }

    // Both hold a player by this point — the empty places were dealt with above.
    const from = selectedSlot as CourtSlot | SitOutSlot;
    const to = slot as CourtSlot | SitOutSlot;
    const newRounds = schedule.rounds.map((round, ri) => {
      if (ri !== slot.roundIdx) return round;

      const newCourts = round.courts.map((court) => ({
        ...court,
        team1: [...court.team1],
        team2: [...court.team2],
      }));
      const newSitOuts = [...round.sitOuts];

      const read = (s: CourtSlot | SitOutSlot): Player =>
        s.kind === 'court'
          ? newCourts[s.courtIdx][s.team][s.playerIdx]
          : newSitOuts[s.sitOutIdx];
      const write = (s: CourtSlot | SitOutSlot, p: Player) => {
        if (s.kind === 'court') newCourts[s.courtIdx][s.team][s.playerIdx] = p;
        else newSitOuts[s.sitOutIdx] = p;
      };

      const playerA = read(from);
      const playerB = read(to);
      write(from, playerB);
      write(to, playerA);

      // Recalculate ratingDiff for any court touched by the swap
      const recalc = (court: (typeof newCourts)[number]) => {
        court.ratingDiff = courtRatingDiff(court.team1, court.team2);
      };
      for (const s of [from, to]) {
        if (s.kind === 'court') recalc(newCourts[s.courtIdx]);
      }

      return { ...round, courts: newCourts, sitOuts: newSitOuts };
    });

    onUpdateSchedule({ rounds: newRounds });
    setSelectedSlot(null);
  }

  // The sheet's reshuffle is this page's reshuffle: the padlocks and the couples
  // broken for one round are held here, and a rebuild that ignored them would
  // undo work the host can see on the screen in front of them.
  const sheetActions: ScheduleActions = {
    ...actions,
    onReshuffle: () => {
      onRegenerate(locks, brokenPairs);
      setSelectedSlot(null);
    },
  };

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

  // Adding a player is an Actions card and only an Actions card. It used to have
  // a shortcut on the first unplayed round's sit-out line, which put a second
  // way in on a page whose whole point is that Actions is the one way in.

  return (
    <div className="space-y-6 no-print">
      {/* One button for everything the host might change mid-session. Going back
          is the Setup tab's job, and printing lives on the header's printer
          button. */}
      <ActionsButton onClick={() => openActions('menu')} />

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
            scoringEnabled={scoringEnabled}
            onEditScore={(courtIdx) => setScoringCourt({ roundIdx, courtIdx })}
          />
          {selectedSlot?.roundIdx === roundIdx && (
            <p className="text-sm text-blue-600 text-center mt-2">
              Tap another player to swap, or tap the trash icon to remove them
            </p>
          )}
        </div>
        );
      })}

      {/* Above the matrix on purpose. The standings are what the room asks for;
          the partner matrix is a diagnostic. */}
      {scoringEnabled && <StandingsPanel schedule={schedule} players={players} />}

      <PartnerSummary schedule={schedule} players={players} />

      {actionsEntry && (
        <ActionsSheet
          key={actionsOpened}
          open
          entry={actionsEntry}
          onClose={() => setActionsEntry(null)}
          schedule={schedule}
          completedRounds={completedRounds}
          players={players}
          addablePlayers={addablePlayers}
          numCourts={numCourts}
          defaultRating={defaultRating}
          actions={sheetActions}
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

      {scoringCourt && schedule.rounds[scoringCourt.roundIdx]?.courts[scoringCourt.courtIdx] && (
        <ScoreDialog
          court={schedule.rounds[scoringCourt.roundIdx].courts[scoringCourt.courtIdx]}
          onDone={handleScoreDone}
          onCancel={() => setScoringCourt(null)}
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
    </div>
  );
}
