import type { Round } from '../types';

/**
 * What each court is called.
 *
 * The app numbers courts 1, 2, 3 because it has no way of knowing better. A
 * centre hands you courts 7, 8 and 9, and calling "Court 1" at a room where
 * court 1 is somebody else's game sends four players to the wrong end of it.
 * The number is a label, so it belongs to the host.
 *
 * A change is made at a round and runs forward from there, because courts do
 * get reassigned part way through a session. It never reaches backwards, and it
 * never touches a round already marked complete: those are a record of what was
 * played, under the name it was played on.
 */

/** As high as a court number may go. No hall has more, and two digits stay readable. */
export const MAX_COURT_NUMBER = 99;

/**
 * Reads what was typed into the box. Digits only, so "7a" or "-3" is refused
 * rather than quietly becoming 7. Null means there is nothing worth saving.
 */
export function parseCourtNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (value < 1 || value > MAX_COURT_NUMBER) return null;
  return value;
}

/**
 * Names one court from `fromRoundIdx` to the end of the schedule.
 *
 * Completed rounds are skipped wherever they fall, which matters because any
 * round can be ticked off in any order: round 7 may be complete while round 5
 * is still to play. Rounds that come out unchanged are returned as they were,
 * so React is not handed a new object for a round nothing happened to.
 */
export function renumberFrom(
  rounds: Round[],
  fromRoundIdx: number,
  courtIdx: number,
  courtNumber: number,
  completedRoundNumbers: number[]
): Round[] {
  const completed = new Set(completedRoundNumbers);
  return rounds.map((round, roundIdx) => {
    if (roundIdx < fromRoundIdx) return round;
    if (completed.has(round.roundNumber)) return round;
    const court = round.courts[courtIdx];
    if (!court || court.courtNumber === courtNumber) return round;
    return {
      ...round,
      courts: round.courts.map((c, ci) => (ci === courtIdx ? { ...c, courtNumber } : c)),
    };
  });
}

/**
 * Carries the names across a rebuild.
 *
 * Reshuffling and removing a player both throw the unplayed rounds away and
 * build them again, and what comes back is numbered 1, 2, 3 from scratch. Court
 * 7 is still court 7 after a reshuffle, so the names are copied back on by
 * position: the rounds line up one for one, and a court is matched to the court
 * that stood in its place before.
 *
 * Where the rebuild has more courts than there were, the new one keeps the
 * number it was born with. There is nothing to copy from.
 */
export function carryCourtNumbers(previous: Round[], next: Round[]): Round[] {
  return next.map((round, roundIdx) => {
    const before = previous[roundIdx];
    if (!before) return round;
    let changed = false;
    const courts = round.courts.map((court, courtIdx) => {
      const was = before.courts[courtIdx];
      if (!was || was.courtNumber === court.courtNumber) return court;
      changed = true;
      return { ...court, courtNumber: was.courtNumber };
    });
    return changed ? { ...round, courts } : round;
  });
}
