import type { Player, Schedule } from '../types';

/**
 * A session as one document.
 *
 * Nothing publishes one yet. It is here so that when something does, the shape
 * it publishes is already settled and already carries a version — a number that
 * cannot be added later, because by then there are documents in the world
 * without it and no way to tell which is which.
 *
 * The whole session is one JSON blob already: the scores live on the courts
 * inside the schedule, so there is nothing to gather up and nothing to join.
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
}

export type SnapshotInput = Omit<SessionSnapshot, 'version' | 'at'>;

export function sessionSnapshot(input: SnapshotInput, at = new Date()): SessionSnapshot {
  return { version: SNAPSHOT_VERSION, at: at.toISOString(), ...input };
}
