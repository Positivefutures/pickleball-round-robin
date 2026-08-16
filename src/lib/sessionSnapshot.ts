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
