import { useEffect, useRef, useState } from 'react';
import type {
  Schedule, Player, LockedPair, Partnership, Round, CourtScore, Gender,
} from '../../types';
import { effectiveCourtCount } from '../../lib/pairing';
import { arePartners, partnerKey } from '../../lib/partnerships';
import { renumberFrom } from '../../lib/courtNumbers';
import { courtRatingDiff } from '../../utils/helpers';
import { openRoundTimer, stopAndResetIfRound } from '../../lib/roundTimer';
import { appScrollTo } from '../../lib/appScroll';
import { RoundCard } from './RoundCard';
import { PartnerSummary } from './PartnerSummary';
import { RemovePlayerDialog } from './RemovePlayerDialog';
import { PlayerMenu } from './PlayerMenu';
import { EditPlayerDialog } from './EditPlayerDialog';
import { CourtNumberDialog } from './CourtNumberDialog';
import { ScoreDialog } from './ScoreDialog';
import { StandingsPanel } from './StandingsPanel';
import { SwapHint } from './SwapHint';
import { ActionsButton } from './ActionsButton';
import { ActionsSheet, type ActionsEntry, type ScheduleActions } from './ActionsSheet';
import { TimerBlockedDialog } from './TimerBlockedDialog';

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

/**
 * How long a place that has just changed hands stays marked.
 *
 * The same two seconds the CSS animation runs for, and it has to be: this is
 * only how long the class stays on the element, and the fade itself is
 * `seat-swapped` in index.css.
 */
const SWAP_FLASH_MS = 2000;

/** Who moved in the last swap, and where. Cleared two seconds later. */
interface SwapFlash {
  roundIdx: number;
  playerIds: string[];
  /**
   * Bumped on every swap. It ends up in the React key of a marked seat, so a
   * second swap inside the two seconds restarts the fade instead of joining one
   * already half over.
   */
  seq: number;
}

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
  onRegenerate: (
    locks: Record<number, LockedPair[]>,
    brokenPairs: Record<number, string[]>
  ) => void;
  onUpdateSchedule: (schedule: Schedule) => void;
  onCompletedRoundsChange: (value: number[]) => void;
  onRemovePlayer: (playerId: string) => void;
  /** Name, rating and gender, saved against the player and written through the rounds. */
  onEditPlayer: (playerId: string, name: string, rating: number, gender: Gender) => void;
  /** False once the host has closed the swap hint, which is remembered for good. */
  showSwapHint: boolean;
  onDismissSwapHint: () => void;
  /**
   * Hides the pencil on a selected seat while the first-run tour is up. The
   * card that teaches swapping leaves the seats live, and a second control
   * inside the seat they have just tapped competes with the one instruction.
   */
  hideSeatEdit?: boolean;
  /**
   * Which Actions view is open, or null while the sheet is shut, and a count
   * that changes on every opening.
   *
   * Held by App rather than here, because App is the only place that knows
   * about the first-run tour — and the tour opens this sheet, moves a card when
   * it opens, and has to shut it again when the host walks back off the card
   * that is drawn over it. The count keys the sheet, so opening it always gets
   * a fresh one: it flashes a confirmation and closes itself, and a second tap
   * during that flash should show the grid rather than the tail of the last
   * thing done.
   */
  actionsSheet: { view: ActionsEntry; opened: number; subOutId?: string } | null;
  onOpenActions: (view: ActionsEntry, subOutId?: string) => void;
  onCloseActions: () => void;
  /** Passed through: the tour's last card asks the question itself. */
  confirmNewSession?: boolean;
  /** Group members not in this session yet, offered by Add Player. */
  addablePlayers: Player[];
  /**
   * Everything behind the Actions button, less the reshuffle. That one is put
   * together here, because the padlocks and broken couples it has to honour are
   * this page's own state and go no further.
   */
  actions: Omit<ScheduleActions, 'onReshuffle' | 'onRemovePlayer'>;
  defaultRating: number;
  /** Whether this session keeps score: the boards and the standings table. */
  scoringEnabled: boolean;
  /**
   * Opens My Account, and calls what it is handed once that panel is closed.
   * Sharing a session needs an account, and a host who taps Create an account
   * is in the middle of something here to come back to.
   */
  onOpenAccount?: (onReturn: () => void) => void;
  /**
   * Whether any padlock is set, or any couple broken for a single round.
   *
   * This page's own state, and the only work on a schedule that App cannot see
   * for itself. It counts: leaving the schedule throws the padlocks away with
   * everything else, so the host is asked first. Reported as it stands rather
   * than announced once, so locking and unlocking again leaves nothing behind.
   */
  onLocksChange?: (any: boolean) => void;
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

/**
 * The padlocks on a round that still mean what they said.
 *
 * A padlock the host set by hand names two players and a place. Both can come
 * apart underneath it: a player is subbed off, or somebody goes home and the
 * remaining rounds are rebuilt around the smaller group, which leaves the same
 * court and side holding two entirely different people.
 *
 * Neither is cosmetic. The padlock is drawn from the place alone, so a stale one
 * appears around a pair the host never locked; and the scheduler, handed a lock
 * naming somebody who is not there, throws away every attempt it makes and
 * returns a round with no courts on it and everybody sitting out. So a lock is
 * only honoured while the two it names are still standing where it left them.
 */
function locksInPlace(round: Round, roundLocks: LockedPair[]): LockedPair[] {
  return roundLocks.filter((lp) => {
    const team = round?.courts[lp.courtIdx]?.[lp.team];
    if (team?.length !== 2) return false;
    const here = new Set([team[0].id, team[1].id]);
    return here.has(lp.player1Id) && here.has(lp.player2Id);
  });
}

/** A partnerKey with one member swapped out, or unchanged if they are not in it. */
function rekey(key: string, outgoingId: string, incomingId: string): string {
  const [a, b] = key.split('|');
  if (a === outgoingId) return partnerKey(incomingId, b);
  if (b === outgoingId) return partnerKey(a, incomingId);
  return key;
}

export function SchedulePage({
  schedule,
  players,
  partnerships,
  numCourts,
  completedRounds,
  canUncomplete,
  onRegenerate,
  onUpdateSchedule,
  onCompletedRoundsChange,
  onRemovePlayer,
  onEditPlayer,
  showSwapHint,
  onDismissSwapHint,
  hideSeatEdit,
  actionsSheet,
  onOpenActions,
  onCloseActions,
  confirmNewSession,
  addablePlayers,
  actions,
  defaultRating,
  scoringEnabled,
  onOpenAccount,
  onLocksChange,
}: Props) {
  const [selectedSlot, setSelectedSlot] = useState<PlayerSlot | null>(null);
  /**
   * The locked seat whose pencil is showing, if any.
   *
   * Its own state rather than a second kind of selection, because the two mean
   * opposite things. A selection is an offer: tap somebody else and the pair
   * change places. A locked player has no such offer to make, and holding them
   * in `selectedSlot` would put the swap machinery and the swap hint behind a
   * tap that cannot swap. Only one of the two is ever set.
   */
  const [pencilSlot, setPencilSlot] = useState<CourtSlot | null>(null);
  const [locks, setLocks] = useState<Record<number, LockedPair[]>>({});
  // Couples the host has broken for a specific round (partnerKeys by round index).
  const [brokenPairs, setBrokenPairs] = useState<Record<number, string[]>>({});
  useEffect(() => {
    onLocksChange?.(Object.keys(locks).length > 0 || Object.keys(brokenPairs).length > 0);
  }, [locks, brokenPairs, onLocksChange]);

  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [removeCandidate, setRemoveCandidate] = useState<Player | null>(null);
  // Tapping a place on the schedule and then its edit button opens this. The two
  // things it offers each open a panel of their own, so only one of the three is
  // ever on screen.
  const [menuPlayer, setMenuPlayer] = useState<Player | null>(null);
  const [editCandidate, setEditCandidate] = useState<Player | null>(null);
  // Which court is being renamed, by the round it was opened from.
  const [editingCourt, setEditingCourt] = useState<{ roundIdx: number; courtIdx: number } | null>(
    null
  );

  // Which court is being scored. Same shape, and open on a completed round too.
  const [scoringCourt, setScoringCourt] = useState<{ roundIdx: number; courtIdx: number } | null>(
    null
  );

  // This page deliberately does not subscribe to the timer. The clock and the
  // time left are drawn by RoundTimerChip, which subscribes on its own so that
  // a countdown ticking four times a second redraws one button rather than
  // every court on the page. The panel itself is owned by App.tsx — see
  // lib/roundTimer.ts for why: this page unmounts on every tab switch, and a
  // running timer has to survive that.
  //
  // Set when a timer icon is tapped while a different round's timer is
  // running, paused, or alarming.
  const [timerBlockedBy, setTimerBlockedBy] = useState<number | null>(null);

  function handleOpenTimer(roundNumber: number) {
    const result = openRoundTimer(roundNumber);
    if (result.blocked) setTimerBlockedBy(result.blockedByRound ?? null);
  }

  /**
   * Who just moved, so the two places they landed in can say so.
   *
   * A swap is two names changing over on a grid of names, and on a phone held at
   * arm's length it is very easy to miss which two. So both places take a strong
   * edge for a moment and let it fade back to the court's own line, which says
   * what happened without leaving anything behind to be read as a state.
   */
  const [swapFlash, setSwapFlash] = useState<SwapFlash | null>(null);
  const flashSeq = useRef(0);
  const flashTimer = useRef<number | undefined>(undefined);
  // Never into an unmounted page: leaving the schedule while a fade is running
  // is the ordinary way out of it.
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  /** Nothing tapped: no seat offering a swap, and no pencil showing. */
  function clearTaps() {
    setSelectedSlot(null);
    setPencilSlot(null);
  }

  /**
   * A tap on a player held by a padlock.
   *
   * It shows their pencil and does nothing else. Tap them again and it goes.
   * Any ordinary selection is dropped, so there is never a pencil in one place
   * and an offer to swap in another.
   */
  function handleLockedTap(slot: CourtSlot) {
    // No guard on a completed round here, unlike handlePlayerTap. That one has
    // a swap behind it and refuses twice on purpose. This shows a pencil and
    // changes nothing, and the seat it comes from will not call it on a round
    // that is finished.
    setSelectedSlot(null);
    setPencilSlot((prev) => (prev && sameSlot(prev, slot) ? null : slot));
  }

  function markSwapped(roundIdx: number, playerIds: string[]) {
    window.clearTimeout(flashTimer.current);
    flashSeq.current += 1;
    setSwapFlash({ roundIdx, playerIds, seq: flashSeq.current });
    flashTimer.current = window.setTimeout(() => setSwapFlash(null), SWAP_FLASH_MS);
  }

  /**
   * The standings, and the two ways between them and the top of the page.
   *
   * Smooth unless the phone has asked for less movement. `scrollIntoView` and
   * `scrollTo` both take a behaviour and neither consults that setting on its
   * own, unlike the CSS property, so it is asked here.
   */
  const standingsRef = useRef<HTMLDivElement>(null);

  /**
   * The first round still to be played, which is where Back to Top goes.
   *
   * Completed rounds float to the top of the list, so this is the card directly
   * under the last of them and it is the one thing on the page worth being
   * shown. Null on a session where nothing is finished yet, and on one where
   * everything is: neither has a next round to put at the top.
   */
  const nextRoundRef = useRef<HTMLDivElement>(null);

  function scrollBehavior(): ScrollBehavior {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  function scrollToStandings() {
    standingsRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }

  /**
   * Back up the page, to the round being played rather than to the header.
   *
   * With rounds behind them, the top of the page is a banner and a row of tabs
   * the host has read, and everything they came back for is below it. So the
   * card that is next lands against the top of the screen instead, which puts
   * the bottom edge of the last completed round exactly on it — the `scroll-mt`
   * on that card is the gap between the two, so the gap stays on screen.
   *
   * With nothing completed, the first round is already the top of the page and
   * the header goes with it.
   */
  function scrollToTop() {
    const next = nextRoundRef.current;
    if (next) {
      next.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      return;
    }
    appScrollTo({ top: 0, behavior: scrollBehavior() });
  }

  const hasPartnerships = partnerships.length > 0;
  const completedSet = new Set(completedRounds);

  // Completion is an arbitrary set: any round can be toggled independently, and
  // completed rounds group at the top of the list. Unchecking is allowed only
  // until a player has been removed (which regenerates the remaining rounds).
  function handleToggleComplete(roundNumber: number) {
    // A round marked DONE has no more use for a countdown — take the timer
    // away rather than leave it running behind an icon that's about to
    // disappear.
    stopAndResetIfRound(roundNumber);
    if (completedSet.has(roundNumber)) {
      if (!canUncomplete) return;
      onCompletedRoundsChange(completedRounds.filter((n) => n !== roundNumber));
    } else {
      onCompletedRoundsChange([...completedRounds, roundNumber]);
    }
    clearTaps();
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
    clearTaps();
  }

  function handleSaveEdit(name: string, rating: number, gender: Gender) {
    if (!editCandidate) return;
    onEditPlayer(editCandidate.id, name, rating, gender);
    setEditCandidate(null);
    clearTaps();
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
      clearTaps();
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
    // Deselect any swap selection when toggling a lock, and put away the pencil
    // it may have been showing: the padlock that made it a locked seat has just
    // gone, so the next tap on that player means the ordinary thing again.
    clearTaps();
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
    // One name moved rather than two, but it is the same gesture and worth the
    // same mark: the place they came from is a gap now, and the only thing on
    // screen that says where they went is the seat they went into.
    markSwapped(empty.roundIdx, [player.id]);
    clearTaps();
  }

  function handlePlayerTap(slot: PlayerSlot) {
    // Completed rounds are frozen — guard here too so a stale selection can't
    // mutate one after it's been marked complete.
    if (completedSet.has(schedule.rounds[slot.roundIdx].roundNumber)) return;
    setPencilSlot(null);

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

    // Read off the round as it stands, before the swap builds a new one. These
    // two are the pair that changed places, whichever way round they end up.
    const before = schedule.rounds[slot.roundIdx];
    const moved = [from, to]
      .map((s) =>
        s.kind === 'court'
          ? before.courts[s.courtIdx][s.team][s.playerIdx]
          : before.sitOuts[s.sitOutIdx]
      )
      .filter((p): p is Player => p !== undefined)
      .map((p) => p.id);

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
    markSwapped(slot.roundIdx, moved);
    clearTaps();
  }

  /**
   * A substitute inherits the padlocks of the player they are standing in for.
   *
   * The couples set up in Setup are handed over by App, which owns them. These
   * are the other kind: the padlock a host clicks between two players who are
   * not a couple, and the couple they have broken for one round by clicking it
   * off. Both are this page's own state and go no further, so both are handed
   * over here. Left alone, the first would be dropped as stale and the second
   * would quietly re-link a pair the host had deliberately separated.
   */
  function handOverPadlocks(outgoingId: string, incomingId: string) {
    setLocks((prev) => {
      const next: Record<number, LockedPair[]> = {};
      for (const [key, roundLocks] of Object.entries(prev)) {
        next[Number(key)] = roundLocks.map((lp) => ({
          ...lp,
          player1Id: lp.player1Id === outgoingId ? incomingId : lp.player1Id,
          player2Id: lp.player2Id === outgoingId ? incomingId : lp.player2Id,
        }));
      }
      return next;
    });
    setBrokenPairs((prev) => {
      const next: Record<number, string[]> = {};
      for (const [key, keys] of Object.entries(prev)) {
        next[Number(key)] = keys.map((k) => rekey(k, outgoingId, incomingId));
      }
      return next;
    });
  }

  // Somebody going home needs no padlocks swept up after them. locksInPlace is
  // the one rule, and it covers this and more: the removal rebuilds every round
  // still to be played, so a padlock is not stale merely because it names a
  // player who has left, it is stale because the place it was put on now holds
  // two different people. A sweep keyed on who went home would miss that.

  // The sheet's reshuffle is this page's reshuffle: the padlocks and the couples
  // broken for one round are held here, and a rebuild that ignored them would
  // undo work the host can see on the screen in front of them.
  const sheetActions: ScheduleActions = {
    ...actions,
    onReshuffle: () => {
      // Only the padlocks still holding the pair they were put on. See
      // locksInPlace: a stale one hands the scheduler a player who is not here,
      // and it answers with a round nobody is playing in.
      const live: Record<number, LockedPair[]> = {};
      for (const [key, roundLocks] of Object.entries(locks)) {
        const roundIdx = Number(key);
        const kept = locksInPlace(schedule.rounds[roundIdx], roundLocks);
        if (kept.length > 0) live[roundIdx] = kept;
      }
      onRegenerate(live, brokenPairs);
      clearTaps();
    },
    onSubstitute: (outgoingId, incomingId) => {
      handOverPadlocks(outgoingId, incomingId);
      actions.onSubstitute(outgoingId, incomingId);
      clearTaps();
    },
    onCreatePlayer: (name, rating, gender, replacingId) => {
      const newId = actions.onCreatePlayer(name, rating, gender, replacingId);
      if (replacingId) handOverPadlocks(replacingId, newId);
      clearTaps();
      return newId;
    },
    // The same removal a player's own panel performs, reached from the grid
    // instead. It is this page's prop rather than App's actions object so that
    // both routes end in one call and cannot come apart.
    onRemovePlayer: (playerId) => {
      onRemovePlayer(playerId);
      // The rounds still to come are rebuilt around the smaller group, so a
      // pencil left showing would be sitting on a place that now holds somebody
      // else entirely, and it would open their panel.
      clearTaps();
    },
  };

  // This page used to report up what leaving it would cost, because the tabs
  // asked before letting anybody off. They no longer ask: leaving keeps the
  // schedule, and the question is now on Generate, which is the only thing that
  // writes over one. App reads what that costs from storage.
  //
  // The padlocks and the couples broken for one round are the exception, and
  // they go quietly. Both are staging for a reshuffle rather than a result, and
  // warning about them would put a dialog back in front of the trip to Players
  // this whole change exists to make free.

  const allComplete = completedSet.size >= schedule.rounds.length;

  // Completed rounds group at the top (numeric order), then the rest — while
  // each round keeps its original index for swaps and its original "Round N".
  const orderedRounds = schedule.rounds
    .map((round, roundIdx) => ({ round, roundIdx, complete: completedSet.has(round.roundNumber) }))
    .sort((a, b) => Number(b.complete) - Number(a.complete)); // stable: keeps numeric order within each group

  // Where Back to Top lands: the first round still to play, but only once
  // something is finished. With nothing finished the first round is the top of
  // the page anyway, and the header deserves to come back with it.
  const anyComplete = completedSet.size > 0;
  const nextRoundNumber = anyComplete
    ? orderedRounds.find(({ complete }) => !complete)?.round.roundNumber
    : undefined;

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
      <ActionsButton onClick={() => onOpenActions('menu')} />

      {/* Completed rounds are frozen, so once they all are there is nothing to
          swap and nothing to say. */}
      {showSwapHint && !allComplete && <SwapHint onDismiss={onDismissSwapHint} />}

      {orderedRounds.map(({ round, roundIdx, complete }) => {
        // Show ad-hoc locks plus every intact couple in this round (deduped by
        // court+team so a couple never renders as two overlapping locks).
        const manualLocks = locksInPlace(round, locks[roundIdx] || []);
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
        // The tour's anchor goes on the round the host calls Round 1, keyed on
        // its number rather than on where it lands in the list: a completed
        // round floats to the top, and the tour must not follow it there.
        //
        // scroll-mt-6 is the same 24px as the space-y-6 above it, so landing
        // here leaves that gap on screen and the completed round above ends
        // exactly on the top edge rather than a hair over it.
        <div
          key={round.roundNumber}
          ref={round.roundNumber === nextRoundNumber ? nextRoundRef : undefined}
          className={round.roundNumber === nextRoundNumber ? 'scroll-mt-6' : undefined}
          data-tutorial={round.roundNumber === 1 ? 'round-1' : undefined}
        >
          <RoundCard
            round={round}
            roundIdx={roundIdx}
            tourRound={round.roundNumber === 1}
            hideSeatEdit={hideSeatEdit}
            // Only the round the swap happened in. The same person is in every
            // round, and marking all of them would say the swap moved somebody
            // for the whole afternoon.
            swappedIds={swapFlash?.roundIdx === roundIdx ? swapFlash.playerIds : undefined}
            swapSeq={swapFlash?.seq}
            selectedSlot={selectedSlot}
            pencilSlot={pencilSlot}
            onPlayerTap={handlePlayerTap}
            onLockedTap={handleLockedTap}
            allPlayers={players}
            locks={roundLocks}
            onToggleLock={handleToggleLock}
            onOpenPlayerMenu={setMenuPlayer}
            isComplete={complete}
            isExpanded={expandedRounds.has(round.roundNumber)}
            canUncomplete={canUncomplete}
            onToggleComplete={() => handleToggleComplete(round.roundNumber)}
            onToggleExpand={() => handleToggleExpand(round.roundNumber)}
            onOpenTimer={() => handleOpenTimer(round.roundNumber)}
            onEditCourtNumber={(courtIdx) => setEditingCourt({ roundIdx, courtIdx })}
            scoringEnabled={scoringEnabled}
            onEditScore={(courtIdx) => setScoringCourt({ roundIdx, courtIdx })}
            onViewStandings={scoringEnabled ? scrollToStandings : undefined}
          />
          {selectedSlot?.roundIdx === roundIdx && (
            <p className="text-sm text-blue-600 text-center mt-2">
              Tap another player to swap, or tap the pencil for more
            </p>
          )}
          {/* A locked player has no swap to offer, so the line above would be
              half wrong. This one says what the pencil is for and where the
              swap went. */}
          {pencilSlot?.roundIdx === roundIdx && (
            <p className="text-sm text-blue-600 text-center mt-2">
              Tap the pencil for more. Unlock the pair to swap.
            </p>
          )}
        </div>
        );
      })}

      {/* Above the matrix on purpose. The standings are what the room asks for;
          the partner matrix is a diagnostic. */}
      {scoringEnabled && (
        <StandingsPanel
          schedule={schedule}
          players={players}
          panelRef={standingsRef}
          onBackToTop={scrollToTop}
        />
      )}

      <PartnerSummary schedule={schedule} players={players} />

      {actionsSheet && (
        <ActionsSheet
          key={actionsSheet.opened}
          open
          entry={actionsSheet.view}
          subOutId={actionsSheet.subOutId}
          onClose={onCloseActions}
          schedule={schedule}
          completedRounds={completedRounds}
          players={players}
          addablePlayers={addablePlayers}
          numCourts={numCourts}
          defaultRating={defaultRating}
          actions={sheetActions}
          confirmNewSession={confirmNewSession}
          onOpenAccount={
            onOpenAccount
              ? // Back onto the card they left, not the grid. They went to make
                // an account so they could share this session, and a signed-in
                // host landing here has a code being made for them already.
                () => onOpenAccount(() => onOpenActions('share-live'))
              : undefined
          }
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

      {timerBlockedBy !== null && (
        <TimerBlockedDialog roundNumber={timerBlockedBy} onClose={() => setTimerBlockedBy(null)} />
      )}

      {menuPlayer && (
        <PlayerMenu
          player={menuPlayer}
          onEdit={() => {
            setEditCandidate(menuPlayer);
            setMenuPlayer(null);
          }}
          onSub={() => {
            setMenuPlayer(null);
            clearTaps();
            onOpenActions('add-sub', menuPlayer.id);
          }}
          onRemove={() => {
            setRemoveCandidate(menuPlayer);
            setMenuPlayer(null);
          }}
          onCancel={() => setMenuPlayer(null)}
        />
      )}

      {editCandidate && (
        <EditPlayerDialog
          player={editCandidate}
          defaultRating={defaultRating}
          onSave={handleSaveEdit}
          onCancel={() => setEditCandidate(null)}
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
