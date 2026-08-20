import type { CourtAssignment, PairingHistory } from '../types';

/**
 * Which group plays on which court.
 *
 * Nothing decided this before. Every solver stamped `courtNumber` as the index
 * it happened to build a court at, so who played where fell out of the order
 * the groups came back in — and on a night of set partners that order is a
 * fixture list read the same way every round, which parked a pair on court one
 * for a whole evening. Measured over 25 twelve-round schedules with everybody
 * paired: 50 of 300 player-schedules never left one court. Ordinary sessions
 * were milder and not clean, the worst player getting 11 of 12 games in one
 * place.
 *
 * Courts are not interchangeable at a real venue — wind, sun, the surface, how
 * far it is from the bathroom — so a pair on the worst one all night has had a
 * worse evening than everybody else, and it reads as unfair however good the
 * pairings were.
 *
 * ## Why this is not a term in the cost function
 *
 * It could have been, alongside partner repeats and team balance. It is not,
 * for two reasons.
 *
 * The first is that a term has to be weighted, and a weight is a claim about
 * how many rating points a court is worth. There is no honest answer, and a
 * wrong one lets court variety buy a lopsided game. Dealing the courts out
 * *after* the groups are chosen removes the question: this cannot make a match
 * worse, because it never changes who plays whom. Every pairing is exactly the
 * one the solver picked.
 *
 * The second is that the session that reported this never reaches the scorer.
 * A fully paired roster short-circuits into partnerPlay, which reads fixtures
 * off a circle-method list and does no scoring at all. A cost-function term
 * would have missed the case it was written for. This runs on every path.
 *
 * ## What it will not move
 *
 * The short court. A round the roster could not fill puts the 2v1 or the game
 * of singles last, and things downstream rely on that — planCourtSizes builds
 * it there and addCourtToRemaining appends after it. Who gets a short game is
 * already rotated, by shortGameCounts.
 *
 * A round with a padlock on it. A padlock names a court by position, which is
 * the host pinning this round by hand, and moving it afterwards would quietly
 * undo them.
 *
 * The off-format courts on a special round. Fifteen people on a gendered night
 * make three gendered courts and one that could not be, and combine() puts the
 * ones that could not be at the end — which is why the card under them reads
 * "Unable to make last game gendered". They stay at the end. Who misses out on
 * the format is already rotated, by specialMissCounts.
 */

/**
 * The cost of putting these players on this court, given where they have been.
 *
 * The marginal increase in the sum of squares: a player's nth game on a court
 * costs `2n + 1`, so a first visit is cheap and a fourth is not. Summing
 * squares rather than counting repeats is what spreads a player across three
 * courts as 4/4/4 rather than 6/3/3 — both have the same number of repeats.
 */
function costAt(court: CourtAssignment, courtIdx: number, history: PairingHistory): number {
  let cost = 0;
  for (const p of [...court.team1, ...court.team2]) {
    cost += 2 * (history.courtCounts[p.id]?.[courtIdx] ?? 0) + 1;
  }
  return cost;
}

/** Every way to order n things. n is a court count, so it is small. */
function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  const build = (taken: number[]) => {
    if (taken.length === n) {
      out.push(taken);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (!taken.includes(i)) build([...taken, i]);
    }
  };
  build([]);
  return out;
}

/**
 * Above this many full courts, try swaps instead of every arrangement.
 *
 * 7! is 5040 arrangements of at most seven groups, which is nothing; 8! is
 * 40320 and 10! is three and a half million. Seven courts is twenty-eight
 * players, so the exhaustive answer covers every session anybody actually runs
 * and the greedy one is there so a big roster stays fast rather than exact.
 */
const EXHAUSTIVE_MAX = 7;

/** Total cost of one arrangement: `order[i]` is the court that goes to slot i. */
function costOf(order: number[], courts: CourtAssignment[], history: PairingHistory): number {
  let total = 0;
  for (let slot = 0; slot < order.length; slot++) {
    total += costAt(courts[order[slot]], slot, history);
  }
  return total;
}

/** Cheapest court for each slot in turn, then swap any pair that improves it. */
function greedyOrder(courts: CourtAssignment[], history: PairingHistory): number[] {
  const order: number[] = [];
  const left = new Set(courts.map((_, i) => i));
  for (let slot = 0; slot < courts.length; slot++) {
    let best = -1;
    let bestCost = Infinity;
    for (const i of left) {
      const cost = costAt(courts[i], slot, history);
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    order.push(best);
    left.delete(best);
  }

  // 2-opt repair, the same shape buildFreshTeamCourts uses on its teams. A
  // slot-by-slot pass commits early and cannot see what it cost later slots.
  let improved = true;
  while (improved) {
    improved = false;
    for (let a = 0; a < order.length; a++) {
      for (let b = a + 1; b < order.length; b++) {
        const now = costAt(courts[order[a]], a, history) + costAt(courts[order[b]], b, history);
        const swapped =
          costAt(courts[order[b]], a, history) + costAt(courts[order[a]], b, history);
        if (swapped < now) {
          [order[a], order[b]] = [order[b], order[a]];
          improved = true;
        }
      }
    }
  }
  return order;
}

/**
 * The round's courts, re-dealt so that people move around the venue, with
 * `courtNumber` restamped to the position each one now holds.
 *
 * Ties keep the order they came in, so a first round — where nobody has a
 * history and every arrangement costs the same — comes back exactly as the
 * solver built it, and nothing that was true of this function's input stops
 * being true of its output.
 */
export function rotateCourts(
  courts: CourtAssignment[],
  history: PairingHistory,
  opts: { pinned?: boolean; keepFrom?: number } = {}
): CourtAssignment[] {
  // A padlocked round is the host's arrangement, not this function's.
  if (opts.pinned) return courts;

  // Everything from the first court that has to stay put is left alone: the
  // short court at the end, and on a special round the tail that the format
  // could not fill.
  const short = courts.length > 0 && courts[courts.length - 1].team1.length
    + courts[courts.length - 1].team2.length < 4;
  const boundary = Math.min(
    short ? courts.length - 1 : courts.length,
    opts.keepFrom !== undefined && opts.keepFrom >= 0 ? opts.keepFrom : courts.length
  );
  const movable = courts.slice(0, boundary);
  const kept = courts.slice(boundary);
  if (movable.length < 2) return courts;

  let bestOrder = movable.map((_, i) => i);
  if (movable.length <= EXHAUSTIVE_MAX) {
    let bestCost = costOf(bestOrder, movable, history);
    for (const order of permutations(movable.length)) {
      const cost = costOf(order, movable, history);
      // Strictly less, so the incoming order wins every tie.
      if (cost < bestCost) {
        bestCost = cost;
        bestOrder = order;
      }
    }
  } else {
    const greedy = greedyOrder(movable, history);
    if (costOf(greedy, movable, history) < costOf(bestOrder, movable, history)) {
      bestOrder = greedy;
    }
  }

  const dealt = [...bestOrder.map((from) => movable[from]), ...kept];
  // The number follows the position, exactly as every solver stamps it. A host
  // who has renamed a court keeps that name on that court: carryCourtNumbers
  // copies the old numbers back by position, after this has run.
  return dealt.map((court, i) => ({ ...court, courtNumber: i + 1 }));
}
