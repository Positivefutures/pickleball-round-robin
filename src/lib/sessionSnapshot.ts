import type { Player, Schedule } from '../types';

/**
 * A session as one document.
 *
 * It carries a version — a number that cannot be added later, because by then
 * there are documents in the world without it and no way to tell which is which.
 * Sharing is the first thing to publish one, so version 1 was still unspent when
 * it came to be used and remains the shape below.
 *
 * The whole session is one JSON blob already: the scores live on the courts
 * inside the schedule, so there is nothing to gather up and nothing to join.
 *
 * A snapshot as built here is the host's own copy. Nothing should leave the
 * device without going through withholdPrivate() first.
 */

export const SNAPSHOT_VERSION = 1;

/**
 * The host's round timer, as a watching phone needs it.
 *
 * A projection rather than the whole `RoundTimerState`: the minutes the host
 * configured, which tone they chose and whether their own phone will make a
 * noise are all settings for the person holding it, and nobody watching can
 * change any of them.
 *
 * `endsAt` is the reason a twenty-second poll is fast enough to run a
 * countdown on. It is an absolute deadline, not a number ticking down, so a
 * watcher subtracts it from their own clock and is right whether the document
 * they are holding arrived a second ago or eleven minutes ago. What that does
 * assume is that the two phones agree on the time, which every phone that has
 * ever been on a network does to well inside a second.
 */
export interface SharedRoundTimer {
  roundNumber: number;
  /** Never 'idle'. A timer nobody has started yet is not worth publishing. */
  phase: 'running' | 'paused' | 'alarming';
  /** Absolute ms deadline on the host's clock. Null unless running. */
  endsAt: number | null;
  /** Frozen ms left while paused, 0 while alarming. Ignored while running. */
  remainingMs: number;
  /**
   * What the host chose for reaching zero, which is where every watching phone
   * starts. Not what it has to do: a watcher can turn the sound off on their
   * own phone, or pick another tone, for the rest of the afternoon. See
   * watchAlerts in stores.ts.
   *
   * `flashOn` was published from the beginning; the other two were added later,
   * and a document without them is read as the host's own defaults rather than
   * as silence. That is deliberately not a version bump — an older app ignores
   * fields it has never heard of, and this one supplies what an older document
   * does not carry.
   */
  flashOn: boolean;
  soundOn?: boolean;
  alarmTone?: string;
}

/**
 * How much of the round is left, on the clock of whichever phone is asking.
 *
 * The mirror of `liveRemainingMs` in roundTimer.ts, for the shape that goes
 * over the wire: computed fresh rather than read off a document that may be
 * twenty seconds old, which is the whole reason a deadline is published
 * instead of a remainder.
 */
export function sharedRemainingMs(timer: SharedRoundTimer, now = Date.now()): number {
  if (timer.phase === 'running') return Math.max(0, (timer.endsAt ?? now) - now);
  if (timer.phase === 'alarming') return 0;
  return timer.remainingMs;
}

/**
 * Whether a phone watching this timer should be treating the round as over.
 *
 * Zero on the reader's own clock is time up, whether or not the host has
 * published the fact yet. Waiting for that would be a countdown sat on 0:00 for
 * the length of a poll, and an alarm that went off after the point had already
 * been played.
 *
 * Beside sharedRemainingMs because it is the same idea one step on, and because
 * two places need the same answer from it: the sheet, which draws TIME'S UP,
 * and the page, which sounds the alarm for a phone whose owner never opened the
 * sheet at all.
 */
export function sharedAlarming(
  timer: SharedRoundTimer,
  remaining = sharedRemainingMs(timer)
): boolean {
  return timer.phase === 'alarming' || (timer.phase === 'running' && remaining === 0);
}

export interface SessionSnapshot {
  version: number;
  /** ISO, on the writer's clock. */
  at: string;
  sessionId: string | null;
  schedule: Schedule;
  completedRounds: number[];
  /** Everybody in the session: guests included, and anyone who has gone home. */
  players: Player[];
  scoringEnabled: boolean;
  /**
   * Whether the host has switched on letting watchers change the scores.
   *
   * The switch, and never the code. A watching phone needs to know whether a
   * score is worth tapping — a session with this off would otherwise offer a
   * prompt for a code that does not exist — and it learns nothing else from a
   * boolean. The code is asked of the database, which is the only thing that
   * knows it.
   *
   * Not part of version 1 and deliberately not a version bump. An older app
   * reading a newer document ignores a field it does not know, and this app
   * reading an older one takes the absence as false, which is what every
   * session published before today meant.
   */
  scoreEditing: boolean;
  /**
   * Whether the watchers get the standings table at all.
   *
   * Added after the fact like `scoreEditing` above, and read the other way
   * round: absent means true. Every session published before this switch
   * existed carried the table, so a document without the field is one that
   * shared it, and reading the absence as false would take the standings off
   * links that are still open on somebody's phone.
   *
   * It says nothing about scoring. A session with scoring off has no table to
   * share whatever this holds, which is why the switch is not offered there.
   */
  standingsShared: boolean;
  /**
   * The round being timed right now, or null when none is.
   *
   * Added after the fact like `scoreEditing` above, and for the same reason
   * not a version bump: an older app reading this ignores a field it has never
   * heard of, and this app reading an older document takes the absence as "no
   * timer", which is what every session published before today meant.
   */
  roundTimer: SharedRoundTimer | null;
}

export type SnapshotInput = Omit<SessionSnapshot, 'version' | 'at'>;

export function sessionSnapshot(input: SnapshotInput, at = new Date()): SessionSnapshot {
  return { version: SNAPSHOT_VERSION, at: at.toISOString(), ...input };
}

/**
 * The same session with the host's private judgement taken out.
 *
 * A rating is one person's opinion of another, kept so the app can balance
 * courts. This document goes behind a link that anyone holding it can open, and
 * simply not drawing a rating would not be enough: it would still be sitting in
 * the JSON for anyone who opened a network tab. So it never leaves the device.
 *
 * Three things go, and all three are the same fact in different clothes:
 * `rating` on every player, `ratingDiff` on every court, and `rosterIds`, which
 * are the host's own group keys and would let two published afternoons be
 * recognised as the same group.
 *
 * Zeroed rather than deleted, and an empty array rather than a missing one, so
 * what comes out the other end is still a Schedule and every component that
 * already reads one still can. Nothing in the viewer reads either field.
 *
 * Gender stays. The viewer draws nothing from it today, but a round already
 * announces itself as Mixed or Gendered on the host's screen, so it is not a
 * fact the session was keeping.
 *
 * Players are reached from three places — the roll, the two teams on every
 * court, and every round's sit-outs — and the same person appears in more than
 * one of them. Every one is rewritten, which is what the test checks by looking
 * for the numbers in the serialised string rather than at any one field.
 */
export function withholdPrivate(snapshot: SessionSnapshot): SessionSnapshot {
  const withheld = (player: Player): Player => ({ ...player, rating: 0, rosterIds: [] });

  return {
    ...snapshot,
    players: snapshot.players.map(withheld),
    schedule: {
      ...snapshot.schedule,
      rounds: snapshot.schedule.rounds.map((round) => ({
        ...round,
        sitOuts: round.sitOuts.map(withheld),
        courts: round.courts.map((court) => ({
          ...court,
          ratingDiff: 0,
          team1: court.team1.map(withheld),
          team2: court.team2.map(withheld),
        })),
      })),
    },
  };
}
