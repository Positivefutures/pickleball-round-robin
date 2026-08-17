import type { CourtAssignment, Round, RoundType } from '../types';

/** The three types, in the order the app lists them. */
export const ROUND_TYPES: RoundType[] = ['gendered', 'mixed', 'skill'];

interface RoundTypeMeta {
  /** Heading in the Game Types panel. */
  title: string;
  /** One line under the heading saying what the format is. */
  description: string;
  /** Read-only summary on Setup, and the badge on the schedule. */
  shortName: string;
  badge: string;
  badgeClass: string;
  /**
   * The line around the tab on a round card: the badge's own fill, several
   * steps down the same ramp, so the edge reads as the colour darkening rather
   * than as a second colour drawn around it.
   *
   * Its own field rather than part of `badgeClass` because the Setup tab prints
   * the same chip flat, inside a panel that already has a line around it.
   */
  badgeEdgeClass: string;
  printColor: string;
}

export const ROUND_TYPE_META: Record<RoundType, RoundTypeMeta> = {
  gendered: {
    title: 'Gendered Games',
    description: 'Men play men and women play women.',
    shortName: 'Gendered',
    badge: 'Gendered Round',
    badgeClass: 'bg-purple-100 text-purple-700',
    badgeEdgeClass: 'border-purple-400',
    printColor: '#7e22ce',
  },
  mixed: {
    title: 'Mixed Games',
    description: 'One man and one woman on each team.',
    shortName: 'Mixed',
    badge: 'Mixed Round',
    badgeClass: 'bg-teal-100 text-teal-700',
    badgeEdgeClass: 'border-teal-400',
    printColor: '#0f766e',
  },
  skill: {
    title: 'Equal Skill Games',
    description: 'You play with and against people near your own level.',
    shortName: 'Equal Skill',
    badge: 'Equal Skill Round',
    badgeClass: 'bg-amber-100 text-amber-800',
    badgeEdgeClass: 'border-amber-400',
    printColor: '#b45309',
  },
};

/**
 * The pill an ordinary round wears in the planner and its picker.
 *
 * Not in ROUND_TYPE_META, because "no type" is not a fourth type: nothing
 * builds a normal round, nothing badges one on the schedule, and a null must
 * not be able to reach the three-type table by accident. Grey at 100 fill, 700
 * ink and 400 edge, which is the same ramp the three coloured ones use.
 */
export const NORMAL_ROUND_META = {
  description: 'The ordinary round robin. Anybody can be drawn with anybody.',
  shortName: 'Normal',
  badge: 'Normal Round',
  badgeClass: 'bg-gray-100 text-gray-700',
  badgeEdgeClass: 'border-gray-400',
} as const;

interface PillMeta {
  /** "Gendered Round" — the picker, where there is room to be explicit. */
  badge: string;
  /** "Gendered" — a row in the planner, beside ROUND 4 on a phone. */
  shortName: string;
  /** One line saying what the format is, for the ⓘ panel. */
  description: string;
  badgeClass: string;
  badgeEdgeClass: string;
}

/** How to paint the pill for a round of this type, `null` included. */
export function pillMeta(type: RoundType | null): PillMeta {
  const meta = type ? ROUND_TYPE_META[type] : NORMAL_ROUND_META;
  return {
    badge: meta.badge,
    shortName: meta.shortName,
    description: meta.description,
    badgeClass: meta.badgeClass,
    badgeEdgeClass: meta.badgeEdgeClass,
  };
}

/**
 * The type a round was built as. Schedules saved before this feature only have
 * the old `isGendered` flag, so everything reads rounds through here.
 */
export function roundTypeOf(round: Round): RoundType | null {
  // Checked against the list rather than simply returned, because a round on a
  // watcher's page arrived over a network: everything else that reads a type
  // uses it to index ROUND_TYPE_META, and a document carrying a word this app
  // has never heard of would take the page down rather than draw no badge.
  if (round.roundType && ROUND_TYPES.includes(round.roundType)) return round.roundType;
  return round.isGendered ? 'gendered' : null;
}

/**
 * Did this court actually get played in the round's format? A roster rarely
 * divides evenly into the format, so a special round fills the courts it can
 * and plays the rest as an ordinary game. Both the schedule and the printout
 * mark those courts, and `updateSpecialMissCounts` puts the players on them
 * first in the queue next time.
 */
/** "3 men and 1 woman", leaving out whichever side is nobody. */
function countOfPeople(men: number, women: number): string {
  const parts: string[] = [];
  if (men > 0) parts.push(men === 1 ? '1 man' : `${men} men`);
  if (women > 0) parts.push(women === 1 ? '1 woman' : `${women} women`);
  return parts.join(' and ');
}

/**
 * Why this court is not playing the round's format, in a line the host can read
 * off the card. Null when there is nothing to explain.
 *
 * A gendered or mixed round fills the courts the roster can fill and plays the
 * rest as an ordinary game, and without a word about it that looks like the
 * setting was ignored. It never was: four men or four women make a gendered
 * court and two of each make a mixed one, and a roster almost never divides
 * into those exactly.
 *
 * Everything here is read off the round as it stands now rather than out of the
 * scheduler that built it. That is deliberate twice over. A saved session holds
 * no record of what the scheduler was thinking, so a reload would have nothing
 * to say; and a host who swaps two players by hand changes the answer, so a
 * remembered reason would start lying the moment they did.
 *
 * Equal Skill never lands here. Every court in a skill round is a rating band by
 * construction, so there is no such thing as one that missed.
 */
export function courtMissReason(
  round: Round,
  type: RoundType,
  court: CourtAssignment
): string | null {
  if (type === 'skill' || courtMatchesType(court, type)) return null;

  const made = round.courts.filter((c) => courtMatchesType(c, type));
  // Everyone the format could not use: the other courts like this one, and the
  // people sitting the round out, who were passed over for the same reason.
  const spare = [
    ...round.courts
      .filter((c) => !courtMatchesType(c, type))
      .flatMap((c) => [...c.team1, ...c.team2]),
    ...round.sitOuts,
  ];
  const men = spare.filter((p) => p.gender === 'M').length;
  const women = spare.filter((p) => p.gender === 'F').length;

  const needs =
    type === 'gendered'
      ? 'A gendered game needs four men or four women.'
      : 'A mixed game needs two men and two women.';

  // With none of the format made at all, there is nothing for these players to
  // be left over from, and the count is simply what the round has.
  return made.length > 0
    ? `${needs} The ${countOfPeople(men, women)} left over cannot make one.`
    : `${needs} This round has ${countOfPeople(men, women)}.`;
}

export function courtMatchesType(court: CourtAssignment, type: RoundType): boolean {
  const teams = [court.team1, court.team2];
  // A court the roster could not fill plays an ordinary game whatever the round
  // is. A 2v1 cannot be mixed, and calling it gendered or equal-skill would be
  // a technicality — nobody standing there is playing the format.
  if (court.team1.length + court.team2.length < 4) return false;
  switch (type) {
    case 'gendered':
      return new Set([...court.team1, ...court.team2].map((p) => p.gender)).size === 1;
    case 'mixed':
      return teams.every((t) => t.length === 2 && t[0].gender !== t[1].gender);
    case 'skill':
      // Every court in a skill round is a rating band by construction.
      return true;
  }
}
