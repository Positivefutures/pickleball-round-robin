import type {
  CourtAssignment, PairingHistory, Partnership, Player, RoundType,
} from '../types';
import { courtRatingDiff, fisherYatesShuffle } from '../utils/helpers';
import { getInteractionCount, scoreAssignment } from './scoring';
import { partnerKey } from './partnerships';
import {
  findBestAssignment,
  findBestAssignmentWithPartners,
  pickBestSplit,
  pickShortSplit,
  type Assignment,
} from './assign';

/** The widest rating gap two players can have and still count as the same level. */
const SAME_LEVEL_GAP = 0.5;
/** Ratings inside one step of each other are interchangeable when banding by skill. */
const BAND_STEP = 0.25;

const MIXED_ITERATIONS = 500;
const SKILL_ITERATIONS = 300;

/**
 * Whether a couple can stay together in a round of this type. A pair that does
 * not fit is split for this round only — the special game type is the point of
 * the round, and Set Partners gives way to it.
 */
export function partnershipFitsType(p1: Player, p2: Player, type: RoundType): boolean {
  switch (type) {
    case 'gendered':
      return p1.gender === p2.gender;
    case 'mixed':
      return p1.gender !== p2.gender;
    case 'skill':
      return Math.abs(p1.rating - p2.rating) <= SAME_LEVEL_GAP;
  }
}

export function findSpecialAssignment(
  type: RoundType,
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory,
  keepTogether: Partnership[],
  allPlayers?: Player[]
): Assignment {
  switch (type) {
    case 'gendered':
      return findGenderedAssignment(activePlayers, numCourts, history, keepTogether, allPlayers);
    case 'mixed':
      return findMixedAssignment(activePlayers, numCourts, history, keepTogether, allPlayers);
    case 'skill':
      return findSkillAssignment(activePlayers, numCourts, history, keepTogether, allPlayers);
  }
}

// --- shared helpers -------------------------------------------------------

/** A player, or a couple who have to be picked and dropped as one. */
interface Unit {
  players: Player[];
  /** Rounds of this type the unit has already missed — the most-starved go first. */
  miss: number;
  rating: number;
  rand: number;
}

function missCount(history: PairingHistory, type: RoundType, id: string): number {
  return history.specialMissCounts[type]?.[id] ?? 0;
}

/** Splits a pool into couple units and singles, most-starved first. */
function unitsOf(
  pool: Player[],
  couples: Partnership[],
  history: PairingHistory,
  type: RoundType
): Unit[] {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const claimed = new Set<string>();
  const units: Unit[] = [];

  for (const c of couples) {
    const p1 = byId.get(c.player1Id);
    const p2 = byId.get(c.player2Id);
    if (!p1 || !p2 || claimed.has(p1.id) || claimed.has(p2.id)) continue;
    claimed.add(p1.id);
    claimed.add(p2.id);
    units.push({
      players: [p1, p2],
      miss: Math.max(missCount(history, type, p1.id), missCount(history, type, p2.id)),
      rating: (p1.rating + p2.rating) / 2,
      rand: Math.random(),
    });
  }

  for (const p of pool) {
    if (claimed.has(p.id)) continue;
    units.push({
      players: [p],
      miss: missCount(history, type, p.id),
      rating: p.rating,
      rand: Math.random(),
    });
  }

  return units.sort((a, b) => b.miss - a.miss || a.rand - b.rand);
}

/**
 * Fills `slots` places from a pool, keeping couples whole. Whoever has missed
 * this type most gets in first, so the people passed over last time are the
 * ones who play it this time.
 */
function takeUnits(
  pool: Player[],
  slots: number,
  couples: Partnership[],
  history: PairingHistory,
  type: RoundType
): { chosen: Player[]; rest: Player[] } {
  const chosen: Player[] = [];
  const rest: Player[] = [];
  for (const u of unitsOf(pool, couples, history, type)) {
    if (chosen.length + u.players.length <= slots) chosen.push(...u.players);
    else rest.push(...u.players);
  }
  return { chosen, rest };
}

/** Ordinary round-robin fill, honouring whichever couples are still in this pool. */
function assignPool(
  players: Player[],
  numCourts: number,
  history: PairingHistory,
  keepTogether: Partnership[],
  allPlayers?: Player[]
): Assignment {
  if (numCourts <= 0 || players.length < 2) {
    return { courts: [], extraSitOuts: players };
  }
  const ids = new Set(players.map((p) => p.id));
  const relevant = keepTogether.filter((c) => ids.has(c.player1Id) && ids.has(c.player2Id));

  // Two or three left over after the format has taken what it can still make a
  // game. They used to sit down.
  if (players.length < 4) {
    const coupleKeys = new Set(relevant.map((c) => partnerKey(c.player1Id, c.player2Id)));
    return { courts: [pickShortSplit(players, 1, coupleKeys)], extraSitOuts: [] };
  }

  return relevant.length > 0
    ? findBestAssignmentWithPartners(players, numCourts, history, relevant, allPlayers)
    : findBestAssignment(players, numCourts, history, allPlayers);
}

function combine(special: CourtAssignment[], rest: Assignment): Assignment {
  const courts = [...special, ...rest.courts];
  courts.forEach((court, i) => {
    court.courtNumber = i + 1;
  });
  return { courts, extraSitOuts: rest.extraSitOuts };
}

// --- gendered -------------------------------------------------------------

/**
 * Hands out the court budget so that as many gendered games happen as possible.
 * Each court goes to whichever gender has more players still waiting, so twelve
 * women and four men on three courts get two women's courts and one men's,
 * rather than the women taking all three and the men being stranded.
 */
function shareCourts(sizeA: number, sizeB: number, budget: number): [number, number] {
  const capA = Math.floor(sizeA / 4);
  const capB = Math.floor(sizeB / 4);
  let a = 0;
  let b = 0;
  while (a + b < budget && (a < capA || b < capB)) {
    const canA = a < capA;
    const canB = b < capB;
    if (canA && (!canB || sizeA - a * 4 >= sizeB - b * 4)) a++;
    else b++;
  }
  return [a, b];
}

function findGenderedAssignment(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory,
  keepTogether: Partnership[],
  allPlayers?: Player[]
): Assignment {
  const males = activePlayers.filter((p) => p.gender === 'M');
  const females = activePlayers.filter((p) => p.gender === 'F');
  const [maleCourts, femaleCourts] = shareCourts(males.length, females.length, numCourts);

  if (maleCourts + femaleCourts === 0) {
    return assignPool(activePlayers, numCourts, history, keepTogether, allPlayers);
  }

  const men = takeUnits(males, maleCourts * 4, keepTogether, history, 'gendered');
  const women = takeUnits(females, femaleCourts * 4, keepTogether, history, 'gendered');

  const menResult = assignPool(men.chosen, maleCourts, history, keepTogether, allPlayers);
  const womenResult = assignPool(women.chosen, femaleCourts, history, keepTogether, allPlayers);

  const leftover = [
    ...men.rest, ...women.rest,
    ...menResult.extraSitOuts, ...womenResult.extraSitOuts,
  ];
  const restCourts = numCourts - maleCourts - femaleCourts;

  return combine(
    [...menResult.courts, ...womenResult.courts],
    assignPool(leftover, restCourts, history, keepTogether, allPlayers)
  );
}

// --- mixed ----------------------------------------------------------------

/** Pairs each man with a woman, favouring people who have not met. */
function buildMixedTeams(
  men: Player[],
  women: Player[],
  history: PairingHistory,
  greedy: boolean
): Player[][] {
  if (!greedy) {
    const shuffledWomen = fisherYatesShuffle(women);
    return fisherYatesShuffle(men).map((man, i) => [man, shuffledWomen[i]]);
  }

  const pairs: { man: Player; woman: Player; count: number; rand: number }[] = [];
  for (const man of men) {
    for (const woman of women) {
      pairs.push({
        man,
        woman,
        count: getInteractionCount(history, man.id, woman.id),
        rand: Math.random(),
      });
    }
  }
  pairs.sort((a, b) => a.count - b.count || a.rand - b.rand);

  const usedMen = new Set<string>();
  const usedWomen = new Set<string>();
  const teams: Player[][] = [];
  for (const pair of pairs) {
    if (usedMen.has(pair.man.id) || usedWomen.has(pair.woman.id)) continue;
    usedMen.add(pair.man.id);
    usedWomen.add(pair.woman.id);
    teams.push([pair.man, pair.woman]);
  }
  return teams;
}

function findMixedAssignment(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory,
  keepTogether: Partnership[],
  allPlayers?: Player[]
): Assignment {
  const byId = new Map(activePlayers.map((p) => [p.id, p]));

  // A man-and-woman couple is already a valid mixed team, so they arrive
  // pre-formed and only need opponents.
  const claimed = new Set<string>();
  const coupleTeams: Player[][] = [];
  for (const c of keepTogether) {
    const p1 = byId.get(c.player1Id);
    const p2 = byId.get(c.player2Id);
    if (!p1 || !p2 || claimed.has(p1.id) || claimed.has(p2.id)) continue;
    if (p1.gender === p2.gender) continue;
    claimed.add(p1.id);
    claimed.add(p2.id);
    coupleTeams.push(p1.gender === 'M' ? [p1, p2] : [p2, p1]);
  }

  const freeMen = activePlayers.filter((p) => p.gender === 'M' && !claimed.has(p.id));
  const freeWomen = activePlayers.filter((p) => p.gender === 'F' && !claimed.has(p.id));
  const mixedCourts = Math.min(
    numCourts,
    Math.floor((freeMen.length + coupleTeams.length) / 2),
    Math.floor((freeWomen.length + coupleTeams.length) / 2)
  );

  if (mixedCourts === 0) {
    return assignPool(activePlayers, numCourts, history, keepTogether, allPlayers);
  }

  const teamsNeeded = mixedCourts * 2;
  const usedCouples = coupleTeams.slice(0, teamsNeeded);
  const freeTeams = teamsNeeded - usedCouples.length;
  const men = takeUnits(freeMen, freeTeams, [], history, 'mixed');
  const women = takeUnits(freeWomen, freeTeams, [], history, 'mixed');

  let bestScore = Infinity;
  let bestCourts: CourtAssignment[] = [];

  for (let i = 0; i < MIXED_ITERATIONS; i++) {
    const teams = fisherYatesShuffle([
      ...usedCouples,
      ...buildMixedTeams(men.chosen, women.chosen, history, i < MIXED_ITERATIONS / 5),
    ]);

    const courts: CourtAssignment[] = [];
    for (let c = 0; c < mixedCourts; c++) {
      const team1 = teams[c * 2];
      const team2 = teams[c * 2 + 1];
      courts.push({
        courtNumber: c + 1,
        team1,
        team2,
        ratingDiff: courtRatingDiff(team1, team2),
      });
    }

    const score = scoreAssignment(courts, history, allPlayers);
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
    }
  }

  const leftover = [
    ...men.rest, ...women.rest,
    ...coupleTeams.slice(teamsNeeded).flat(),
  ];

  return combine(
    bestCourts,
    assignPool(leftover, numCourts - mixedCourts, history, keepTogether, allPlayers)
  );
}

// --- equal skill ----------------------------------------------------------

/**
 * Sorts into rating order and carves the list into courts of four. Ratings
 * within one step of each other share a rung, and the shuffle beforehand lets
 * them trade places, so repeated skill rounds are not the same four people
 * every time.
 */
function buildBands(units: Unit[]): Player[][] | null {
  const rung = (rating: number) => Math.round(rating / BAND_STEP);
  const ordered = fisherYatesShuffle(units).sort((a, b) => rung(b.rating) - rung(a.rating));

  const bands: Player[][] = [];
  let current: Player[] = [];
  const pending = [...ordered];

  while (pending.length > 0) {
    // A couple cannot squeeze into a single remaining place, so take the first
    // unit that does fit rather than giving up on the band.
    const idx = pending.findIndex((u) => u.players.length <= 4 - current.length);
    if (idx === -1) return null;
    current.push(...pending[idx].players);
    pending.splice(idx, 1);
    if (current.length === 4) {
      bands.push(current);
      current = [];
    }
  }

  return current.length === 0 ? bands : null;
}

/** Like pickBestSplit, but a couple in this band stays on the same team. */
function splitBand(
  four: Player[],
  history: PairingHistory,
  courtNumber: number,
  coupleKeys: Set<string>
): CourtAssignment {
  for (let i = 0; i < four.length; i++) {
    for (let j = i + 1; j < four.length; j++) {
      if (!coupleKeys.has(partnerKey(four[i].id, four[j].id))) continue;
      const team1 = [four[i], four[j]];
      const team2 = four.filter((p) => p.id !== four[i].id && p.id !== four[j].id);
      return {
        courtNumber,
        team1,
        team2,
        ratingDiff: courtRatingDiff(team1, team2),
      };
    }
  }
  return pickBestSplit(four, history, courtNumber);
}

function findSkillAssignment(
  activePlayers: Player[],
  numCourts: number,
  history: PairingHistory,
  keepTogether: Partnership[],
  allPlayers?: Player[]
): Assignment {
  const courtsToFill = Math.min(numCourts, Math.floor(activePlayers.length / 4));
  if (courtsToFill === 0) {
    return { courts: [], extraSitOuts: activePlayers };
  }

  const { chosen, rest } = takeUnits(
    activePlayers, courtsToFill * 4, keepTogether, history, 'skill'
  );
  const chosenIds = new Set(chosen.map((p) => p.id));
  const couples = keepTogether.filter(
    (c) => chosenIds.has(c.player1Id) && chosenIds.has(c.player2Id)
  );
  const coupleKeys = new Set(couples.map((c) => partnerKey(c.player1Id, c.player2Id)));
  const units = unitsOf(chosen, couples, history, 'skill');

  let bestScore = Infinity;
  let bestCourts: CourtAssignment[] = [];

  for (let i = 0; i < SKILL_ITERATIONS; i++) {
    const bands = buildBands(units);
    if (!bands) continue;

    const courts = bands.map((band, c) => splitBand(band, history, c + 1, coupleKeys));
    const score = scoreAssignment(courts, history, allPlayers);
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
    }
  }

  if (bestCourts.length === 0) {
    // Banding never resolved — fall back rather than leave the round empty.
    const fallback = assignPool(chosen, courtsToFill, history, keepTogether, allPlayers);
    return { courts: fallback.courts, extraSitOuts: [...rest, ...fallback.extraSitOuts] };
  }

  // Whoever the bands could not take plays an ordinary game on a spare court,
  // the same as the gendered and mixed rounds do with their leftovers.
  const spare = numCourts - bestCourts.length;
  if (spare > 0 && rest.length >= 2) {
    return combine(bestCourts, assignPool(rest, spare, history, keepTogether, allPlayers));
  }

  return { courts: bestCourts, extraSitOuts: rest };
}
