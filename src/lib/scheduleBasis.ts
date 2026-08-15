import type { Partnership, Player, Schedule, SpecialGameTypes } from '../types';
import { roundTypeOf } from './roundTypes';
import { prunePartnerships } from './partnerships';

/**
 * What a schedule was built from, boiled down to one string.
 *
 * The Schedule tab is a door back to the schedule already made, and it has to
 * shut the moment that schedule stops describing the session. Rather than a
 * dirty flag set by whatever happened to be remembered, the app writes this key
 * down while the host is looking at the schedule, and compares it against the
 * live one on the way back. Same key, same schedule, door open.
 *
 * A comparison rather than a flag also means changing your mind costs nothing:
 * three courts to four and back to three is the key it started as, and the
 * schedule is still there. A flag would have thrown it away on the first tap.
 *
 * What is deliberately not in here is `scoringEnabled`. Keeping score is a
 * setting about the session, not an input to the pairings, and the scores
 * themselves live on the schedule — so it can be switched either way all
 * afternoon without costing anybody their rounds.
 */
export interface BasisInput {
  rosterId: string | null;
  /** Everyone actually in the session: ticked, minus anyone removed. */
  attending: Player[];
  partnerships: Partnership[];
  numCourts: number;
  numRounds: number;
  specialTypes: SpecialGameTypes;
  schedule: Schedule | null;
}

/** Sorted, so the order players were ticked in is not a difference. */
function ids(players: Player[]): string {
  return players
    .map((p) => p.id)
    .sort()
    .join(',');
}

/**
 * Each couple written smallest id first, then the list sorted.
 *
 * Only the couples both of whose members are actually playing, which is the set
 * generation itself builds from. It matters that this is pruned here rather
 * than trusted from the store: the store is tidied up by an effect a render
 * later, so a couple broken by somebody leaving the group would otherwise be in
 * the key one moment and gone the next, and the tab would shut on its own a
 * beat after the app had decided it should stay open.
 */
function couples(partnerships: Partnership[], attending: Player[]): string {
  const playing = new Set(attending.map((p) => p.id));
  return prunePartnerships(partnerships, playing)
    .map((p) => [p.player1Id, p.player2Id].sort().join('+'))
    .sort()
    .join(',');
}

/** Every round type and its setting, in a fixed order rather than key order. */
function formats(types: SpecialGameTypes): string {
  return Object.keys(types)
    .sort()
    .map((k) => {
      const setting = types[k as keyof SpecialGameTypes];
      return `${k}:${JSON.stringify(setting)}`;
    })
    .join(',');
}

/**
 * Whether this schedule has a round built around who is a man and who is a
 * woman. Read through `roundTypeOf` so schedules saved by older builds, which
 * wrote `isGendered` instead, are read the same way.
 *
 * Skill rounds are not counted. They are built around ratings, and a rating is
 * not part of this key at all — see the note on `genders` below.
 */
export function hasGenderedRound(schedule: Schedule | null): boolean {
  if (!schedule) return false;
  return schedule.rounds.some((r) => {
    const type = roundTypeOf(r);
    return type === 'gendered' || type === 'mixed';
  });
}

/**
 * Who is which, but only when it can matter.
 *
 * A schedule of ordinary games does not care, so correcting somebody typed in
 * as a man is free and the schedule survives it. A schedule with a Gendered or
 * Mixed round in it was built around exactly this, so the same correction means
 * the rounds no longer say the truth and a new one has to be generated.
 *
 * This is the one place the Players tab is stricter than the Schedule tab. The
 * edit button on a court deliberately leaves the round alone and lets the
 * "(normal game)" note say what happened, because there the host can see the
 * consequence the moment they make it. From the Players tab they cannot.
 *
 * Ratings get no equivalent, on purpose. Every schedule is balanced on them, so
 * keying on ratings would mean correcting one number cost the host their
 * afternoon — and unlike a gendered round, an ordinary court built on a rating
 * that has since been nudged is still a perfectly playable court.
 */
function genders(attending: Player[], schedule: Schedule | null): string {
  if (!hasGenderedRound(schedule)) return '';
  return attending
    .map((p) => `${p.id}:${p.gender}`)
    .sort()
    .join(',');
}

/**
 * The whole basis as one string, for storing beside the schedule and comparing
 * on the way back. Newline-separated because none of the parts can contain one.
 */
export function basisKey(input: BasisInput): string {
  return [
    input.rosterId ?? '',
    ids(input.attending),
    couples(input.partnerships, input.attending),
    String(input.numCourts),
    String(input.numRounds),
    formats(input.specialTypes),
    genders(input.attending, input.schedule),
  ].join('\n');
}

/**
 * Whether the schedule still describes the session in front of the host.
 *
 * A missing basis means stale. That is the honest answer for a session parked
 * by a build that did not write one: the schedule is real, but nothing recorded
 * what it was built from, so the app cannot promise the door is safe.
 */
export function scheduleIsStale(stored: string | null, live: BasisInput): boolean {
  if (!stored) return true;
  return stored !== basisKey(live);
}
