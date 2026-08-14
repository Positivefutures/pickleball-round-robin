import type { CourtAssignment, LockedPair, PairingHistory, Partnership, Player } from '../types';
import { courtRatingDiff, fisherYatesShuffle } from '../utils/helpers';
import { partnerKey } from './partnerships';
import { getInteractionCount, getPartnerCount, scoreAssignment, scoreCourt } from './scoring';

/** What every court-filling routine hands back: the courts it built, and anyone left over. */
export interface Assignment {
  courts: CourtAssignment[];
  extraSitOuts: Player[];
}

/**
 * How many players go on each court, in order.
 *
 * A court holds four, but a roster that does not divide by four is no reason to
 * sit anybody down. The last court plays whoever is left: three of them is a
 * 2v1, two is a game of singles. One person is not a game, so on that remainder
 * they sit out and the court goes unused.
 *
 * Once every court is full the leftovers sit out as before, which is why short
 * courts and sit-outs never appear in the same round.
 */
export function planCourtSizes(numPlayers: number, numCourts: number): number[] {
  const full = Math.max(0, Math.min(numCourts, Math.floor(numPlayers / 4)));
  const sizes: number[] = new Array(full).fill(4);
  if (full < numCourts) {
    const left = numPlayers - full * 4;
    if (left >= 2) sizes.push(left);
  }
  return sizes;
}

// How many courts can actually be used by this many players, counting a short
// court as a court. A roster that shrinks mid-session may support fewer courts
// than were originally requested.
export function effectiveCourtCount(numPlayers: number, numCourts: number): number {
  return planCourtSizes(numPlayers, numCourts).length;
}

/** Doubles. Two a side, and the whole app is built on it. */
export const SEATS_PER_COURT = 4;

/**
 * What a session opens on before anybody has said otherwise, and the initial
 * value behind stores.numCourts.
 *
 * Named rather than left as a 3 in the store, because two other things are
 * written against it: the Sample Group is sized so Select All on this many
 * courts still sits somebody out, and the first-run tour says "three courts"
 * out loud. Change this and both of those are wrong.
 */
export const DEFAULT_COURTS = 3;

/**
 * The smallest roster that can put a game on every court asked for. Two short of
 * a full set still works — the last court plays singles — but three short would
 * leave somebody standing on a court alone, and that is where it stops.
 *
 * One court always wants a full four. A session of two or three people needs no
 * schedule, and dropping the floor there would only let the app build something
 * nobody wants.
 */
export function minPlayersForCourts(numCourts: number): number {
  return Math.max(SEATS_PER_COURT, numCourts * SEATS_PER_COURT - 2);
}

/**
 * Builds the court the roster could not fill.
 *
 * Three players are a 2v1 with the strongest of them on their own, which is the
 * only arrangement that makes it a game rather than a hiding. Two are a game of
 * singles. A couple stays a couple and takes the pair side: Set Partners
 * outranks the rating.
 */
export function pickShortSplit(
  group: Player[],
  courtNumber: number,
  coupleKeys?: Set<string>
): CourtAssignment {
  const court = (team1: Player[], team2: Player[]): CourtAssignment => ({
    courtNumber,
    team1,
    team2,
    ratingDiff: courtRatingDiff(team1, team2),
  });

  if (group.length <= 2) return court(group.slice(0, 1), group.slice(1, 2));

  if (coupleKeys) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (!coupleKeys.has(partnerKey(group[i].id, group[j].id))) continue;
        const pair = [group[i], group[j]];
        return court(pair, group.filter((_, k) => k !== i && k !== j));
      }
    }
  }

  const byRating = [...group].sort((a, b) => b.rating - a.rating);
  return court(byRating.slice(1), byRating.slice(0, 1));
}

/**
 * What a candidate short-court group costs in repeated company. A trio's pair
 * side is exactly what `pickShortSplit` will choose — a couple if one is
 * there, otherwise the two weakest — so the cost of that pairing is known
 * before the group is settled. A couple costs nothing: partnering is their
 * whole arrangement. A game of singles is judged on opponent repeats instead.
 */
function shortGroupCost(
  group: Player[],
  history: PairingHistory,
  coupleKeys: Set<string>
): number {
  if (group.length === 3) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (coupleKeys.has(partnerKey(group[i].id, group[j].id))) return 0;
      }
    }
    const byRating = [...group].sort((a, b) => b.rating - a.rating);
    const [p1, p2] = [byRating[1], byRating[2]];
    const count = getPartnerCount(history, p1.id, p2.id);
    const last = history.lastPartneredRound?.[partnerKey(p1.id, p2.id)];
    const gap = last === undefined
      ? Infinity
      : (history.roundsRecorded ?? 0) + 1 - last;
    return count * count * 40 + 25 * Math.max(0, 3 - gap);
  }
  if (group.length === 2) {
    return history.opponentCounts[group[0].id]?.[group[1].id] ?? 0;
  }
  return 0;
}

/**
 * Who plays the short game this round.
 *
 * Whoever has had fewest of them goes first — the same rotation the sit-out line
 * uses — so fifteen players over four courts take the 2v1 in turn instead of it
 * landing on the same three every round. Couples move as one, except onto a
 * court of two, where there is no team to keep them on.
 */
export function chooseShortCourtPlayers(
  candidates: Player[],
  size: number,
  history: PairingHistory,
  keepTogether: Partnership[] = [],
  /** A pair the host padlocked onto this court. They keep their place. */
  pinned: Player[] = []
): Player[] {
  const held = pinned.slice(0, size);
  if (held.length >= size) return held;

  const heldIds = new Set(held.map((p) => p.id));
  candidates = candidates.filter((p) => !heldIds.has(p.id));
  size -= held.length;

  const shortGames = (p: Player) => history.shortGameCounts?.[p.id] ?? 0;
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const claimed = new Set<string>();
  const units: { players: Player[]; short: number; rand: number }[] = [];

  for (const c of keepTogether) {
    const p1 = byId.get(c.player1Id);
    const p2 = byId.get(c.player2Id);
    if (!p1 || !p2 || claimed.has(p1.id) || claimed.has(p2.id)) continue;
    claimed.add(p1.id);
    claimed.add(p2.id);
    // A couple is only a candidate where the short court has a pair side to put
    // them on. On a singles court they are held back for the full courts.
    if (size >= 3) {
      units.push({
        players: [p1, p2],
        short: Math.min(shortGames(p1), shortGames(p2)),
        rand: Math.random(),
      });
    }
  }

  for (const p of candidates) {
    if (claimed.has(p.id)) continue;
    units.push({ players: [p], short: shortGames(p), rand: Math.random() });
  }
  units.sort((a, b) => a.short - b.short || a.rand - b.rand);

  // The rotation stands: fewest short games goes first, always. But the last
  // place often has several players tied on that count, and the pair side of
  // the 2v1 falls out of whoever gets it — the one spot the round's scorer
  // never sees. Left to the random tie-break it was quietly reuniting recent
  // partners, so among rotation ties the freshest resulting pair wins.
  const coupleKeys = new Set(
    keepTogether.map((c) => partnerKey(c.player1Id, c.player2Id))
  );
  const chosen: Player[] = [];
  const remaining = [...units];
  while (chosen.length < size) {
    const fitting = remaining.filter((u) => chosen.length + u.players.length <= size);
    if (fitting.length === 0) break;
    let pick = fitting[0];
    const ties = fitting.filter((u) => u.short === pick.short);
    if (ties.length > 1 && chosen.length + pick.players.length === size) {
      let bestCost = Infinity;
      for (const u of ties) {
        const cost = shortGroupCost(
          [...held, ...chosen, ...u.players], history, coupleKeys
        );
        if (cost < bestCost) {
          bestCost = cost;
          pick = u;
        }
      }
    }
    chosen.push(...pick.players);
    remaining.splice(remaining.indexOf(pick), 1);
  }
  if (chosen.length === size) return [...held, ...chosen];

  // Nothing but held-back couples left to draw on. Split one rather than leave
  // a court standing empty.
  const taken = new Set(chosen.map((p) => p.id));
  for (const p of candidates) {
    if (chosen.length === size) break;
    if (!taken.has(p.id)) chosen.push(p);
  }
  return [...held, ...chosen];
}

export function pickBestSplit(
  four: Player[],
  history: PairingHistory,
  courtNumber: number
): CourtAssignment {
  const splits: [Player[], Player[]][] = [
    [[four[0], four[1]], [four[2], four[3]]],
    [[four[0], four[2]], [four[1], four[3]]],
    [[four[0], four[3]], [four[1], four[2]]],
  ];

  // Scored by the same cost function as whole rounds, so the split chooser
  // cannot disagree with the round sampler about what a good court is. The
  // coverage term is left out: all three splits share the same six pairs.
  let best: CourtAssignment | null = null;
  let bestScore = Infinity;

  for (const [team1, team2] of splits) {
    const court: CourtAssignment = {
      courtNumber,
      team1,
      team2,
      ratingDiff: courtRatingDiff(team1, team2),
    };
    const score = scoreCourt(court, history);
    if (score < bestScore) {
      bestScore = score;
      best = court;
    }
  }

  return best!;
}

// Build courts by greedily targeting players who haven't met yet.
// Returns groups of 4 players for each court, plus extras who sit out.
function buildGreedyCourts(
  activePlayers: Player[],
  effectiveCourts: number,
  history: PairingHistory
): { groups: Player[][]; extras: Player[] } {
  const pool = new Set(activePlayers.map((p) => p.id));
  const playerMap = new Map(activePlayers.map((p) => [p.id, p]));
  const groups: Player[][] = [];

  // Build a sorted list of unmet pairs, lowest debt first. Partnering counts
  // double: a pair that has already been a team owes more variety than a pair
  // that has only stood across the net, and a plain interaction count could
  // not tell those apart — which is how repeat partners slipped through.
  const pairDebts: { id1: string; id2: string; count: number }[] = [];
  const playerList = activePlayers.filter((p) => pool.has(p.id));
  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const count = getPartnerCount(history, playerList[i].id, playerList[j].id)
        + getInteractionCount(history, playerList[i].id, playerList[j].id);
      pairDebts.push({ id1: playerList[i].id, id2: playerList[j].id, count });
    }
  }
  // Shuffle first for randomized tie-breaking, then sort by count ascending
  for (let i = pairDebts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairDebts[i], pairDebts[j]] = [pairDebts[j], pairDebts[i]];
  }
  pairDebts.sort((a, b) => a.count - b.count);

  for (let c = 0; c < effectiveCourts; c++) {
    if (pool.size < 4) break;

    // Find the highest-priority unmet pair still in the pool
    let seed1: string | undefined;
    let seed2: string | undefined;
    for (const debt of pairDebts) {
      if (pool.has(debt.id1) && pool.has(debt.id2)) {
        seed1 = debt.id1;
        seed2 = debt.id2;
        break;
      }
    }

    // Fallback: pick two random from pool
    if (!seed1 || !seed2) {
      const arr = Array.from(pool);
      seed1 = arr[0];
      seed2 = arr[1];
    }

    pool.delete(seed1);
    pool.delete(seed2);

    // Pick 2 more players by how fresh they are against the seeds. A player
    // who has never PARTNERED a seed scores 2, never met them at all scores 3
    // — so the group keeps room for a new team even after everyone has met.
    const freshness = (id: string, others: string[]) => {
      let f = 0;
      for (const other of others) {
        if (getPartnerCount(history, id, other) === 0) f += 2;
        if (getInteractionCount(history, id, other) === 0) f += 1;
      }
      return f;
    };
    const remaining = Array.from(pool);
    const scored = remaining.map((id) => {
      // Small tiebreaker: total unmet count (prefer players with more unmet people)
      let totalUnmet = 0;
      for (const otherId of remaining) {
        if (otherId !== id && getInteractionCount(history, id, otherId) === 0) totalUnmet++;
      }
      return { id, fresh: freshness(id, [seed1!, seed2!]), totalUnmet, rand: Math.random() };
    });
    // Sort: freshest first, then most unmet, then random
    scored.sort((a, b) => {
      if (b.fresh !== a.fresh) return b.fresh - a.fresh;
      if (b.totalUnmet !== a.totalUnmet) return b.totalUnmet - a.totalUnmet;
      return a.rand - b.rand;
    });

    const pick3 = scored[0]?.id;
    if (pick3) pool.delete(pick3);

    // Re-score for 4th player considering all 3 already picked. Below
    // freshness, prefer a fourth who makes the court's men even in number —
    // 0, 2 or 4 men is a gendered or mixed shape, 3 and 1 is nobody's
    // favourite game.
    const trio = (pick3 ? [seed1, seed2, pick3] : [seed1, seed2])
      .map((id) => playerMap.get(id!)!)
      .filter(Boolean);
    const trioMen = trio.filter((p) => p.gender === 'M').length;
    const remaining2 = Array.from(pool);
    const scored2 = remaining2.map((id) => ({
      id,
      fresh: freshness(id, pick3 ? [seed1!, seed2!, pick3] : [seed1!, seed2!]),
      lopsided: (trioMen + (playerMap.get(id)?.gender === 'M' ? 1 : 0)) % 2,
      rand: Math.random(),
    }));
    scored2.sort((a, b) => {
      if (b.fresh !== a.fresh) return b.fresh - a.fresh;
      if (a.lopsided !== b.lopsided) return a.lopsided - b.lopsided;
      return a.rand - b.rand;
    });

    const pick4 = scored2[0]?.id;
    if (pick4) pool.delete(pick4);

    const group = [seed1, seed2, pick3, pick4]
      .filter(Boolean)
      .map((id) => playerMap.get(id!)!)
      .filter(Boolean);
    if (group.length === 4) {
      groups.push(group);
    }
  }

  const extras = Array.from(pool).map((id) => playerMap.get(id)!).filter(Boolean);
  return { groups, extras };
}

/**
 * Builds a round the other way about: teams first, courts second.
 *
 * The greedy and random strategies pick each court's four players and only
 * then split them into teams, so late in a session — when few never-partnered
 * pairs remain — they stop stumbling onto the fresh pairings that still
 * exist. This one starts from the pairing promise itself: match everyone to
 * the freshest partner available (greedy, in random order, priced with the
 * scorer's own repeat and recency numbers), then give each team the opposing
 * team that scores cheapest. The full-round scorer arbitrates between all
 * three strategies as usual.
 */
function buildFreshTeamCourts(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory
): CourtAssignment[] | null {
  const pairCost = (p: Player, q: Player): number => {
    const count = getPartnerCount(history, p.id, q.id);
    if (count === 0) return 0;
    let cost = count * count * 40;
    const last = history.lastPartneredRound?.[partnerKey(p.id, q.id)];
    if (last !== undefined) {
      const gap = (history.roundsRecorded ?? 0) + 1 - last;
      cost += 25 * Math.max(0, 3 - gap);
    }
    return cost;
  };

  const unmatched = fisherYatesShuffle(activePlayers);
  const teams: [Player, Player][] = [];
  while (unmatched.length >= 2) {
    const p = unmatched.shift()!;
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < unmatched.length; i++) {
      const cost = pairCost(p, unmatched[i]);
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }
    teams.push([p, unmatched.splice(bestIdx, 1)[0]]);
  }

  // Greedy matching strands pairs: taking the fresh partner in front of you
  // can leave the last two players as a repeat that a different arrangement
  // avoids. Swap members between teams while any swap lowers the cost.
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const [a, b] = teams[i];
        const [c, d] = teams[j];
        const current = pairCost(a, b) + pairCost(c, d);
        const acbd = pairCost(a, c) + pairCost(b, d);
        const adbc = pairCost(a, d) + pairCost(b, c);
        if (acbd < current && acbd <= adbc) {
          teams[i] = [a, c];
          teams[j] = [b, d];
          improved = true;
        } else if (adbc < current) {
          teams[i] = [a, d];
          teams[j] = [b, c];
          improved = true;
        }
      }
    }
  }

  const courts: CourtAssignment[] = [];
  const remaining = [...teams];
  while (courts.length < numCourts && remaining.length >= 2) {
    const team1 = remaining.shift()!;
    let bestIdx = 0;
    let best: CourtAssignment | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const court: CourtAssignment = {
        courtNumber: courts.length + 1,
        team1,
        team2: remaining[i],
        ratingDiff: courtRatingDiff(team1, remaining[i]),
      };
      const score = scoreCourt(court, history);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
        best = court;
      }
    }
    remaining.splice(bestIdx, 1);
    courts.push(best!);
  }
  return courts.length === numCourts ? courts : null;
}

export function findBestAssignment(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory,
  allPlayers?: Player[]
): Assignment {
  const sizes = planCourtSizes(activePlayers.length, numCourts);
  if (sizes.length === 0) {
    return { courts: [], extraSitOuts: activePlayers };
  }

  // A short court, if there is one, is always the last. Everything above it is
  // built by the ordinary four-a-court search and is unaffected by it.
  const shortSize = sizes[sizes.length - 1] < 4 ? sizes[sizes.length - 1] : 0;
  const fullCourts = shortSize ? sizes.length - 1 : sizes.length;
  const numNeeded = fullCourts * 4 + shortSize;

  let bestScore = Infinity;
  let bestCourts: CourtAssignment[] = [];
  let bestExtras: Player[] = [];

  // --- Greedy iterations: build courts targeting unmet pairs ---
  for (let i = 0; i < 500; i++) {
    const { groups, extras } = buildGreedyCourts(activePlayers, fullCourts, history);
    if (groups.length !== fullCourts) continue;

    const courts: CourtAssignment[] = groups.map((group, c) =>
      pickBestSplit(group, history, c + 1)
    );
    if (shortSize) courts.push(pickShortSplit(extras.slice(0, shortSize), fullCourts + 1));

    const score = scoreAssignment(courts, history, allPlayers);
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
      bestExtras = extras.slice(shortSize);
    }
  }

  // --- Random iterations: explore broader space ---
  for (let i = 0; i < 500; i++) {
    const shuffled = fisherYatesShuffle(activePlayers);
    const playersForCourts = shuffled.slice(0, fullCourts * 4);
    const extras = shuffled.slice(numNeeded);

    const courts: CourtAssignment[] = [];
    for (let c = 0; c < fullCourts; c++) {
      const fourPlayers = playersForCourts.slice(c * 4, c * 4 + 4);
      courts.push(pickBestSplit(fourPlayers, history, c + 1));
    }
    if (shortSize) {
      courts.push(
        pickShortSplit(shuffled.slice(fullCourts * 4, numNeeded), fullCourts + 1)
      );
    }

    const score = scoreAssignment(courts, history, allPlayers);
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
      bestExtras = extras;
    }
  }

  // --- Fresh-team iterations: teams first, courts second ---
  // Only when the pool divides cleanly into full courts; a round with a short
  // court draws it before this solver runs. Fewer iterations than the other
  // strategies because the 2-opt repair makes each one converge on its own.
  if (shortSize === 0 && activePlayers.length === fullCourts * 4) {
    for (let i = 0; i < 150; i++) {
      const courts = buildFreshTeamCourts(activePlayers, fullCourts, history);
      if (!courts) continue;
      const score = scoreAssignment(courts, history, allPlayers);
      if (score < bestScore) {
        bestScore = score;
        bestCourts = courts;
        bestExtras = [];
      }
    }
  }

  return { courts: bestCourts, extraSitOuts: bestExtras };
}

export function findBestAssignmentWithLocks(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory,
  lockedPairs: LockedPair[],
  allPlayers?: Player[]
): Assignment {
  const effectiveCourts = Math.min(numCourts, Math.floor(activePlayers.length / 4));

  if (effectiveCourts === 0) {
    return { courts: [], extraSitOuts: activePlayers };
  }

  // Build a map of locked pairs by courtIdx
  const locksByCourtIdx = new Map<number, LockedPair[]>();
  for (const lp of lockedPairs) {
    if (lp.courtIdx < effectiveCourts) {
      const existing = locksByCourtIdx.get(lp.courtIdx) || [];
      existing.push(lp);
      locksByCourtIdx.set(lp.courtIdx, existing);
    }
  }

  // Identify locked player IDs and resolve locked players
  const lockedIds = new Set<string>();
  const lockedPlayerMap = new Map<string, Player>();
  for (const p of activePlayers) {
    lockedPlayerMap.set(p.id, p);
  }
  for (const lp of lockedPairs) {
    lockedIds.add(lp.player1Id);
    lockedIds.add(lp.player2Id);
  }

  // Free players = active but not locked
  const freePlayers = activePlayers.filter((p) => !lockedIds.has(p.id));

  const NUM_ITERATIONS = 1000;
  let bestScore = Infinity;
  let bestCourts: CourtAssignment[] = [];
  let bestExtras: Player[] = [];

  for (let i = 0; i < NUM_ITERATIONS; i++) {
    const shuffled = fisherYatesShuffle(freePlayers);
    let freeIdx = 0;

    const courts: CourtAssignment[] = [];
    let valid = true;

    for (let c = 0; c < effectiveCourts; c++) {
      const courtsLocks = locksByCourtIdx.get(c) || [];
      const team1Lock = courtsLocks.find((lp) => lp.team === 'team1');
      const team2Lock = courtsLocks.find((lp) => lp.team === 'team2');

      let team1: Player[];
      let team2: Player[];

      if (team1Lock) {
        const p1 = lockedPlayerMap.get(team1Lock.player1Id);
        const p2 = lockedPlayerMap.get(team1Lock.player2Id);
        if (!p1 || !p2) { valid = false; break; }
        team1 = [p1, p2];
      } else {
        if (freeIdx + 2 > shuffled.length) { valid = false; break; }
        team1 = [shuffled[freeIdx++], shuffled[freeIdx++]];
      }

      if (team2Lock) {
        const p1 = lockedPlayerMap.get(team2Lock.player1Id);
        const p2 = lockedPlayerMap.get(team2Lock.player2Id);
        if (!p1 || !p2) { valid = false; break; }
        team2 = [p1, p2];
      } else {
        if (freeIdx + 2 > shuffled.length) { valid = false; break; }
        team2 = [shuffled[freeIdx++], shuffled[freeIdx++]];
      }

      // For fully-free courts, try pickBestSplit for optimal team split
      if (!team1Lock && !team2Lock) {
        const fourPlayers = [...team1, ...team2];
        courts.push(pickBestSplit(fourPlayers, history, c + 1));
      } else {
        courts.push({
          courtNumber: c + 1,
          team1,
          team2,
          ratingDiff: courtRatingDiff(team1, team2),
        });
      }
    }

    if (!valid) continue;

    const extras = shuffled.slice(freeIdx);
    const score = scoreAssignment(courts, history, allPlayers);
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
      bestExtras = extras;
    }
  }

  // If no valid iteration found (edge case), return empty
  if (bestCourts.length === 0 && effectiveCourts > 0) {
    return { courts: [], extraSitOuts: activePlayers };
  }

  return { courts: bestCourts, extraSitOuts: bestExtras };
}

// Placement-agnostic partner keeping: each partnership is a fixed 2-player team
// that must stay together, but — unlike a LockedPair — the scheduler is free to
// choose which court and which opponents it gets. Free singles fill the rest.
// This keeps couples together every round while still mixing up opponents.
export function findBestAssignmentWithPartners(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory,
  keepTogether: Partnership[],
  allPlayers?: Player[]
): Assignment {
  const effectiveCourts = Math.min(numCourts, Math.floor(activePlayers.length / 4));

  if (effectiveCourts === 0) {
    return { courts: [], extraSitOuts: activePlayers };
  }

  const byId = new Map(activePlayers.map((p) => [p.id, p]));

  // Resolve partnerships whose members are both active into fixed 2-player teams.
  const claimed = new Set<string>();
  const pairTeams: Player[][] = [];
  for (const pr of keepTogether) {
    const p1 = byId.get(pr.player1Id);
    const p2 = byId.get(pr.player2Id);
    if (!p1 || !p2 || claimed.has(p1.id) || claimed.has(p2.id)) continue;
    claimed.add(p1.id);
    claimed.add(p2.id);
    pairTeams.push([p1, p2]);
  }

  const singles = activePlayers.filter((p) => !claimed.has(p.id));

  // Guard: partnerships can never exceed the team slots because they occupy 2 of
  // the exactly 4*effectiveCourts active players — but stay defensive.
  if (pairTeams.length > effectiveCourts * 2) {
    return findBestAssignment(activePlayers, numCourts, history, allPlayers);
  }

  const NUM_ITERATIONS = 1000;
  let bestScore = Infinity;
  let bestCourts: CourtAssignment[] = [];
  let bestExtras: Player[] = [];

  for (let iter = 0; iter < NUM_ITERATIONS; iter++) {
    const shuffledPairs = fisherYatesShuffle(pairTeams);
    const shuffledSingles = fisherYatesShuffle(singles);

    // Each court exposes two team slots; scatter the pair-teams across them so a
    // couple may face another couple or a pair of singles round to round.
    const slots: number[] = [];
    for (let c = 0; c < effectiveCourts; c++) {
      slots.push(c, c);
    }
    const shuffledSlots = fisherYatesShuffle(slots);

    const courtPairs: Player[][][] = Array.from({ length: effectiveCourts }, () => []);
    for (let i = 0; i < shuffledPairs.length; i++) {
      courtPairs[shuffledSlots[i]].push(shuffledPairs[i]);
    }

    const courts: CourtAssignment[] = [];
    let si = 0;
    for (let c = 0; c < effectiveCourts; c++) {
      const pairs = courtPairs[c];
      const freeSlots = 4 - pairs.length * 2;
      const courtSingles = shuffledSingles.slice(si, si + freeSlots);
      si += freeSlots;

      if (pairs.length === 2) {
        courts.push({
          courtNumber: c + 1,
          team1: pairs[0],
          team2: pairs[1],
          ratingDiff: courtRatingDiff(pairs[0], pairs[1]),
        });
      } else if (pairs.length === 1) {
        courts.push({
          courtNumber: c + 1,
          team1: pairs[0],
          team2: courtSingles,
          ratingDiff: courtRatingDiff(pairs[0], courtSingles),
        });
      } else {
        // Fully-free court: optimise the 2v2 split like the default path.
        courts.push(pickBestSplit(courtSingles, history, c + 1));
      }
    }

    const extras = shuffledSingles.slice(si);
    const score = scoreAssignment(courts, history, allPlayers);
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
      bestExtras = extras;
    }
  }

  if (bestCourts.length === 0 && effectiveCourts > 0) {
    return { courts: [], extraSitOuts: activePlayers };
  }

  return { courts: bestCourts, extraSitOuts: bestExtras };
}
