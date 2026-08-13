import type { CourtAssignment, PairingHistory, Partnership, Player } from '../types';
import { courtRatingDiff } from '../utils/helpers';
import { partnerKey } from './partnerships';

/**
 * A night of partner play: everybody has a partner, those two stay together all
 * evening, and the schedule is a round robin between the teams rather than
 * between the people.
 *
 * This is a different question from the one the rest of the app asks. Everywhere
 * else a partnership is a constraint on an otherwise free search — keep these
 * two together, now go and find good courts. Here the teams are the whole
 * roster, so there is nothing left to search for: the only thing that matters is
 * the order the teams meet in, and there is one right answer to that. Every team
 * plays every other team once before anybody plays anybody twice.
 *
 * So this path does not score, sample or shuffle. It builds the fixture list
 * once, deterministically, and reads the next matches off it.
 */

/** A fixed team, in the canonical order the fixture list is built from. */
export interface Team {
  /** partnerKey of the two players — stable, and independent of tap order. */
  key: string;
  players: [Player, Player];
}

/** Two teams meeting, as indexes into the team list. */
export interface Match {
  a: number;
  b: number;
}

/**
 * Every player is in a partnership, give or take one who could not be.
 *
 * An odd roster cannot pair everybody, and the host who has partnered the other
 * twelve of thirteen clearly means to run partner play, so one spare does not
 * disqualify it. Two spares is a different evening — those two could be a team
 * and are not, so the ordinary solver is the better answer and this returns
 * null.
 *
 * The spare gets no game. That is the honest consequence of fixed teams and an
 * odd roster, and the Schedule page says so rather than hiding it.
 */
export function partnerPlayTeams(
  players: Player[],
  partnerships: Partnership[]
): { teams: Team[]; spares: Player[] } | null {
  const byId = new Map(players.map((p) => [p.id, p]));
  const claimed = new Set<string>();
  const teams: Team[] = [];

  for (const pr of partnerships) {
    const p1 = byId.get(pr.player1Id);
    const p2 = byId.get(pr.player2Id);
    if (!p1 || !p2 || claimed.has(p1.id) || claimed.has(p2.id)) continue;
    claimed.add(p1.id);
    claimed.add(p2.id);
    teams.push({ key: partnerKey(p1.id, p2.id), players: [p1, p2] });
  }

  const spares = players.filter((p) => !claimed.has(p.id));
  if (teams.length < 2 || spares.length > 1) return null;

  // Sorted, so the fixture list depends on who the teams are and not on the
  // order the host happened to create them in. Reshuffling or rebuilding the
  // back half of a session then lands on the same fixtures it would have had.
  teams.sort((t1, t2) => (t1.key < t2.key ? -1 : t1.key > t2.key ? 1 : 0));
  return { teams, spares };
}

/**
 * The full fixture list, every team against every other exactly once, in the
 * order they should be played.
 *
 * Circle method: team 0 stays put and the rest rotate around it, which produces
 * rounds in which every team appears exactly once. Reading those rounds out in
 * order is what spreads the sit-outs evenly — over one turn of the circle every
 * team plays once, so with more teams than courts they take turns without
 * anybody having to count.
 *
 * An odd number of teams gets a phantom to rotate against. Whoever draws the
 * phantom sits that turn of the circle out, which is the bye.
 */
export function fixtureList(teamCount: number): Match[] {
  if (teamCount < 2) return [];

  const odd = teamCount % 2 === 1;
  const n = odd ? teamCount + 1 : teamCount;
  const phantom = n - 1; // only exists when odd; teamCount..n-1 is one index

  // [0] is fixed, [1..n-1] rotates.
  const wheel = Array.from({ length: n }, (_, i) => i);
  const matches: Match[] = [];

  for (let turn = 0; turn < n - 1; turn++) {
    for (let i = 0; i < n / 2; i++) {
      const a = wheel[i];
      const b = wheel[n - 1 - i];
      if (odd && (a === phantom || b === phantom)) continue;
      matches.push(a < b ? { a, b } : { a: b, b: a });
    }
    // Rotate everything but the fixed first seat.
    wheel.splice(1, 0, wheel.pop() as number);
  }

  return matches;
}

/** Order-independent key for "these two teams met". */
export function matchKey(key1: string, key2: string): string {
  return key1 < key2 ? `${key1}~${key2}` : `${key2}~${key1}`;
}

/**
 * The matches to play next, given everything already played.
 *
 * `teamMatchCounts` says how many times each fixture has been played, so the
 * pass number is simply the lowest count on the board: every fixture sitting at
 * that number is still owed this time round. Once the last one is played they
 * all rise together and the list starts again from the top, which is what makes
 * a second pass repeat the first in the same order.
 *
 * Courts are filled by walking the fixture list from the top and taking whatever
 * fits, skipping any match whose teams are already on court this round. Order is
 * the boss: the schedule is not reordered to even out sit-outs, because the
 * circle it came from already does that over a full pass.
 *
 * When the fixtures left in this pass will not fill the courts, the next pass is
 * opened early to fill them rather than leaving a court standing empty. That is
 * Jeff's call, made knowing what it costs: 28 fixtures across 3 courts leaves
 * one over at the end, so the round that plays it starts two teams on their
 * second meeting while two other teams have not had their first. An idle court
 * on a booked evening is the worse of the two.
 *
 * It only ever bites on that last short round of a pass. Whenever the courts
 * divide the fixture list evenly, every pass is exactly full and no round is
 * ever mixed.
 */
export function nextMatches(
  teams: Team[],
  fixtures: Match[],
  history: PairingHistory,
  capacity: number
): Match[] {
  if (capacity < 1 || fixtures.length === 0) return [];

  const countOf = (m: Match) =>
    history.teamMatchCounts[matchKey(teams[m.a].key, teams[m.b].key)] ?? 0;

  const pass = fixtures.reduce((min, m) => Math.min(min, countOf(m)), Infinity);

  const busy = new Set<number>();
  const picked: Match[] = [];

  // One sweep per pass, oldest first, so a fixture still owed from this pass is
  // always taken ahead of one borrowed from the next.
  for (let level = pass; picked.length < capacity; level++) {
    const before = picked.length;
    for (const m of fixtures) {
      if (picked.length >= capacity) break;
      if (countOf(m) !== level) continue;
      if (busy.has(m.a) || busy.has(m.b)) continue;
      picked.push(m);
      busy.add(m.a);
      busy.add(m.b);
    }
    // Nothing at this level and nothing above it either: every team that could
    // still be put on a court already is. Stop rather than spin.
    if (picked.length === before && !fixtures.some((m) => countOf(m) > level)) break;
  }

  return picked;
}

/** Turns chosen fixtures into courts, in fixture order. */
export function matchesToCourts(teams: Team[], matches: Match[]): CourtAssignment[] {
  return matches.map((m, i) => {
    const team1 = [...teams[m.a].players];
    const team2 = [...teams[m.b].players];
    return {
      courtNumber: i + 1,
      team1,
      team2,
      ratingDiff: courtRatingDiff(team1, team2),
    };
  });
}

/**
 * Notes which fixtures a round used up.
 *
 * Called for the rounds the round robin built, and replayed over the completed
 * rounds of a session being rebuilt, so a reshuffle of rounds six to ten knows
 * what rounds one to five already spent. A court only counts when both sides are
 * whole teams: a special round type may have split a couple, and a round it
 * broke up is not a fixture anybody played.
 */
export function recordTeamMatches(
  history: PairingHistory,
  courts: CourtAssignment[],
  teams: Team[]
) {
  const keyOfPlayer = new Map<string, string>();
  for (const t of teams) {
    keyOfPlayer.set(t.players[0].id, t.key);
    keyOfPlayer.set(t.players[1].id, t.key);
  }

  const wholeTeam = (side: Player[]): string | null => {
    if (side.length !== 2) return null;
    const k1 = keyOfPlayer.get(side[0].id);
    const k2 = keyOfPlayer.get(side[1].id);
    return k1 && k1 === k2 ? k1 : null;
  };

  for (const court of courts) {
    const a = wholeTeam(court.team1);
    const b = wholeTeam(court.team2);
    if (!a || !b) continue;
    const k = matchKey(a, b);
    history.teamMatchCounts[k] = (history.teamMatchCounts[k] ?? 0) + 1;
  }
}
