import type { RoundPlan, RoundType } from '../types';
import { ROUND_TYPES } from './roundTypes';

/**
 * The host's per-round plan: what each round is played as.
 *
 * Every rule about the plan lives here, and everything that reads one goes
 * through `planAt` rather than indexing the array. Two things follow from that,
 * and both matter:
 *
 * - A plan is always 16 slots, whatever the session's length. The Rounds
 *   stepper stops at 16, the UI draws `numRounds` of them, and the tail is kept
 *   rather than cut — so dropping to 4 rounds and back to 8 gives rounds 5-8
 *   back exactly as they were.
 * - Anything past the end is an ordinary round. `handleAddRounds` can push a
 *   session past 16, and a plan arriving over sync was written by a build this
 *   one has never met.
 */
export const PLAN_SLOTS = 16;

/** Every round ordinary: what a host who has never opened the planner has. */
export function emptyPlan(): RoundPlan {
  return Array<RoundType | null>(PLAN_SLOTS).fill(null);
}

/**
 * Anything into a usable plan: padded to at least 16 slots, and every entry
 * either one of the three types or null.
 *
 * The same defence `roundTypeOf` documents, and it matters more here. That one
 * guards a round that arrived over a network; this one guards a plan that
 * arrived over sync, from an account another device wrote, possibly by a later
 * build with a fourth type in it. An unknown word would go on to index
 * ROUND_TYPE_META and take the page down rather than draw an ordinary round.
 */
export function normalizeRoundPlan(raw: unknown, minLength = PLAN_SLOTS): RoundPlan {
  const source = Array.isArray(raw) ? raw : [];
  const length = Math.max(minLength, source.length);
  const plan: RoundPlan = [];
  for (let i = 0; i < length; i++) {
    const entry = source[i];
    plan.push(ROUND_TYPES.includes(entry as RoundType) ? (entry as RoundType) : null);
  }
  return plan;
}

/** What round `roundNumber` (1-based) is played as. Off the end is ordinary. */
export function planAt(plan: RoundPlan, roundNumber: number): RoundType | null {
  return plan[roundNumber - 1] ?? null;
}

/** The plan with one round set, grown to fit if the round is past the end. */
export function setPlanType(
  plan: RoundPlan,
  roundNumber: number,
  type: RoundType | null
): RoundPlan {
  if (roundNumber < 1) return plan;
  const next = normalizeRoundPlan(plan, roundNumber);
  next[roundNumber - 1] = type;
  return next;
}

/**
 * Moves the type in round `from` to round `to`, sliding everything between them
 * along. Both are 1-based round numbers.
 *
 * The round numbers do not move: the list always reads ROUND 1..N top to
 * bottom, and this permutes the types across those slots. Mid-session that has
 * a second part — a round already played keeps both its type and its position,
 * so only the unlocked slots are reordered, among themselves. Splice the values
 * out of the open positions, move one, write them back into those same
 * positions. A locked round is never a landing place and never shifts.
 *
 * Slots past `numRounds` are untouched: the host is not looking at them, and
 * they are the rounds waiting to come back if the stepper goes up again.
 */
export function moveRound(
  plan: RoundPlan,
  from: number,
  to: number,
  numRounds: number,
  locked: ReadonlySet<number>
): RoundPlan {
  const next = normalizeRoundPlan(plan, numRounds);
  const open: number[] = [];
  for (let n = 1; n <= numRounds; n++) if (!locked.has(n)) open.push(n);

  const fromIdx = open.indexOf(from);
  const toIdx = open.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return plan;

  const values = open.map((n) => next[n - 1]);
  const [moved] = values.splice(fromIdx, 1);
  values.splice(toIdx, 0, moved);
  open.forEach((n, i) => {
    next[n - 1] = values[i];
  });
  return next;
}

/**
 * Every round ordinary again, except the ones already played.
 *
 * The whole plan and not just the rounds on screen: a host who has cleared the
 * afternoon and then adds two rounds back should get two ordinary rounds, not a
 * format they thought they had thrown away.
 *
 * A round already played is left exactly as it was played. Nothing is going to
 * rebuild it, so clearing it here would only make the list lie about what
 * happened on court.
 */
export function clearPlan(plan: RoundPlan, locked: ReadonlySet<number>): RoundPlan {
  const next = normalizeRoundPlan(plan);
  return next.map((type, i) => (locked.has(i + 1) ? type : null));
}

/**
 * Which formats this session actually uses, in the order the app lists them.
 *
 * Each named once however many rounds are played as it. The Setup panel shows
 * these under a shut Set Round Types, and the question a host is asking at a
 * glance is "is there a gendered round this afternoon", not how many — a count
 * would be a number to work out against a list they can open in one tap.
 *
 * Ordinary rounds are not a format and have no pill; the answer for a session
 * of nothing but those is an empty array, and nothing is drawn.
 *
 * Rounds already played are in, unlike planHasTypes below. A gendered round is
 * a gendered round whether it is still to come or already on the board.
 */
export function planTypesUsed(plan: RoundPlan, numRounds: number): RoundType[] {
  const seen = new Set<RoundType>();
  for (let n = 1; n <= numRounds; n++) {
    const type = planAt(plan, n);
    if (type) seen.add(type);
  }
  return ROUND_TYPES.filter((type) => seen.has(type));
}

/** Is there anything for `clearPlan` to do? */
export function planHasTypes(
  plan: RoundPlan,
  numRounds: number,
  locked: ReadonlySet<number>
): boolean {
  for (let n = 1; n <= numRounds; n++) {
    if (!locked.has(n) && planAt(plan, n) !== null) return true;
  }
  return false;
}

/**
 * The plan as one string, for the schedule basis.
 *
 * Truncated to `numRounds`, and that is not tidiness. A type left sitting in
 * slot 10 of an eight-round session is a round nobody can see, and without the
 * truncation it would change the key and shut the Schedule tab for it.
 */
export function planKey(plan: RoundPlan, numRounds: number): string {
  const parts: string[] = [];
  for (let n = 1; n <= numRounds; n++) parts.push(planAt(plan, n) ?? '-');
  return parts.join(',');
}

/**
 * Did anything the session has still to play change?
 *
 * What the host did to a round already on the board does not count, because
 * nothing is going to rebuild it. Opening the planner, having a look and
 * pressing Done must not reshuffle the afternoon, and this is the gate that
 * says so.
 */
export function unplayedChanged(
  before: RoundPlan,
  after: RoundPlan,
  numRounds: number,
  completed: number[]
): boolean {
  const done = new Set(completed);
  for (let n = 1; n <= numRounds; n++) {
    if (done.has(n)) continue;
    if (planAt(before, n) !== planAt(after, n)) return true;
  }
  return false;
}
