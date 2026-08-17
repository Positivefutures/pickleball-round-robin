import { describe, it, expect } from 'vitest';
import { generateSchedule } from './pairing';
import { partnershipFitsType } from './specialRounds';
import { PLAN_SLOTS } from './roundPlan';
import type {
  CourtAssignment, Gender, Partnership, Player, Round, RoundPlan, RoundType,
} from '../types';

/** Every round is this type, so a short schedule exercises it repeatedly. */
function everyRound(type: RoundType): RoundPlan {
  return Array<RoundType | null>(PLAN_SLOTS).fill(type);
}

/** `men` men then `women` women, all on the same rating unless one is given. */
function roster(men: number, women: number, ratingOf?: (i: number) => number): Player[] {
  const total = men + women;
  return Array.from({ length: total }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    rating: ratingOf ? ratingOf(i) : 4.0,
    gender: (i < men ? 'M' : 'F') as Gender,
    rosterIds: ['r1'],
  }));
}

const onCourt = (c: CourtAssignment) => [...c.team1, ...c.team2];
const genders = (c: CourtAssignment) => new Set(onCourt(c).map((p) => p.gender));
const isSingleGender = (c: CourtAssignment) => genders(c).size === 1;
const isMixed = (c: CourtAssignment) =>
  [c.team1, c.team2].every((t) => t.length === 2 && t[0].gender !== t[1].gender);

const together = (round: Round, id1: string, id2: string) =>
  round.courts.some((c) =>
    [c.team1, c.team2].some(
      (t) => t.some((p) => p.id === id1) && t.some((p) => p.id === id2)
    )
  );

describe('partnershipFitsType', () => {
  const man = { rating: 4.0, gender: 'M' } as Player;
  const otherMan = { rating: 4.5, gender: 'M' } as Player;
  const woman = { rating: 4.0, gender: 'F' } as Player;
  const strongWoman = { rating: 5.0, gender: 'F' } as Player;

  it('keeps two men together on a gendered round and splits a couple', () => {
    expect(partnershipFitsType(man, otherMan, 'gendered')).toBe(true);
    expect(partnershipFitsType(man, woman, 'gendered')).toBe(false);
  });

  it('keeps a man and a woman together on a mixed round and splits two men', () => {
    expect(partnershipFitsType(man, woman, 'mixed')).toBe(true);
    expect(partnershipFitsType(man, otherMan, 'mixed')).toBe(false);
  });

  it('splits a skill round pair only when their ratings are far apart', () => {
    expect(partnershipFitsType(man, otherMan, 'skill')).toBe(true);
    expect(partnershipFitsType(man, strongWoman, 'skill')).toBe(false);
  });
});

describe('gendered rounds', () => {
  it('makes every court single gender when the numbers divide', () => {
    const s = generateSchedule(roster(8, 8), 4, 4, everyRound('gendered'));
    for (const round of s.rounds) {
      expect(round.roundType).toBe('gendered');
      expect(round.courts).toHaveLength(4);
      expect(round.courts.every(isSingleGender)).toBe(true);
    }
  });

  it('shares the courts out rather than letting one gender take them all', () => {
    // Twelve women and four men used to give the women all three courts and
    // strand the men in the sit-outs.
    const s = generateSchedule(roster(4, 12), 4, 3, everyRound('gendered'));
    for (const round of s.rounds) {
      expect(round.sitOuts).toHaveLength(0);
      expect(round.courts.filter(isSingleGender).length).toBe(4);
      const mensCourts = round.courts.filter(
        (c) => isSingleGender(c) && onCourt(c)[0].gender === 'M'
      );
      expect(mensCourts).toHaveLength(1);
    }
  });

  it('fills what it can and plays the rest as normal when a gender is short', () => {
    // Two women cannot make a women's court, so they play an ordinary one.
    const s = generateSchedule(roster(14, 2), 4, 3, everyRound('gendered'));
    for (const round of s.rounds) {
      expect(round.roundType).toBe('gendered');
      expect(round.courts.filter(isSingleGender).length).toBe(3);
      expect(round.courts).toHaveLength(4);
    }
  });
});

describe('mixed rounds', () => {
  it('puts a man and a woman on every team when the numbers divide', () => {
    const s = generateSchedule(roster(8, 8), 4, 4, everyRound('mixed'));
    for (const round of s.rounds) {
      expect(round.roundType).toBe('mixed');
      expect(round.courts).toHaveLength(4);
      expect(round.courts.every(isMixed)).toBe(true);
    }
  });

  it('fills what it can and plays the rest as normal when a gender is short', () => {
    const s = generateSchedule(roster(14, 2), 4, 3, everyRound('mixed'));
    for (const round of s.rounds) {
      expect(round.courts).toHaveLength(4);
      expect(round.courts.filter(isMixed)).toHaveLength(1);
    }
  });

  it('gives the mixed court to whoever missed out last time', () => {
    // Only one mixed court fits, so twelve of the fourteen men miss each round.
    // Nobody should get a second turn while anyone is still waiting for a first.
    const s = generateSchedule(roster(14, 2), 4, 4, everyRound('mixed'));
    const menWhoPlayedMixed: string[] = [];
    for (const round of s.rounds) {
      const court = round.courts.find(isMixed)!;
      menWhoPlayedMixed.push(...onCourt(court).filter((p) => p.gender === 'M').map((p) => p.id));
    }
    expect(menWhoPlayedMixed).toHaveLength(8);
    expect(new Set(menWhoPlayedMixed).size).toBe(8);
  });
});

describe('equal skill rounds', () => {
  // Two clearly separated levels: eight beginners and eight strong players.
  const twoLevels = () => roster(8, 8, (i) => (i % 2 === 0 ? 3.0 : 5.0));

  it('never puts the strongest players with the weakest', () => {
    const s = generateSchedule(twoLevels(), 4, 4, everyRound('skill'));
    for (const round of s.rounds) {
      expect(round.roundType).toBe('skill');
      expect(round.courts).toHaveLength(4);
      for (const court of round.courts) {
        const ratings = new Set(onCourt(court).map((p) => p.rating));
        expect(ratings.size).toBe(1);
      }
    }
  });

  it('keeps the rating spread on a court far tighter than an ordinary round', () => {
    const players = roster(8, 8, (i) => 3.0 + i * 0.125);
    const spread = (round: Round) =>
      Math.max(
        ...round.courts.map((c) => {
          const ratings = onCourt(c).map((p) => p.rating);
          return Math.max(...ratings) - Math.min(...ratings);
        })
      );

    const skill = generateSchedule(players, 4, 4, everyRound('skill'));
    const normal = generateSchedule(players, 4, 4);

    const normalSpreads = normal.rounds.map(spread);
    const worstSkill = Math.max(...skill.rounds.map(spread));
    const meanNormal = normalSpreads.reduce((a, b) => a + b, 0) / normalSpreads.length;

    // Bounds measured over 300 schedules: the widest skill court is 0.625 in
    // every one of them, and an ordinary round averages 1.28 at its narrowest.
    // This used to compare against the *tightest* ordinary round, which dips to
    // 0.625 about once in 300 and tied the assertion into failing.
    expect(worstSkill).toBeLessThanOrEqual(0.625);
    expect(meanNormal).toBeGreaterThan(1.0);
  });

  it('does not sit the same four players together every skill round', () => {
    const players = roster(8, 8, () => 4.0);
    const s = generateSchedule(players, 4, 6, everyRound('skill'));
    // Every rating is identical, so banding is meaningless and the round should
    // behave like a normal one rather than freezing into fixed foursomes.
    const firstCourt = s.rounds.map((r) =>
      onCourt(r.courts[0]).map((p) => p.id).sort().join()
    );
    expect(new Set(firstCourt).size).toBeGreaterThan(1);
  });
});

describe('Set Partners against a special game type', () => {
  const couple = (a: number, b: number): Partnership[] => [
    { player1Id: `p${a}`, player2Id: `p${b}` },
  ];

  it('keeps two men together through every gendered round', () => {
    const s = generateSchedule(roster(8, 8), 4, 4, everyRound('gendered'), couple(0, 1));
    for (const round of s.rounds) {
      expect(together(round, 'p0', 'p1')).toBe(true);
      expect(round.courts.every(isSingleGender)).toBe(true);
    }
  });

  it('keeps a man and a woman together through every mixed round', () => {
    // p0 is a man, p8 the first woman.
    const s = generateSchedule(roster(8, 8), 4, 4, everyRound('mixed'), couple(0, 8));
    for (const round of s.rounds) {
      expect(together(round, 'p0', 'p8')).toBe(true);
      expect(round.courts.every(isMixed)).toBe(true);
    }
  });

  it('still makes gendered courts when a couple would prevent them', () => {
    // A man and a woman cannot both be on a men's court, so this pair has to
    // give way for the round. Gendered games happening at all is the assertion.
    const s = generateSchedule(roster(8, 8), 4, 4, everyRound('gendered'), couple(0, 8));
    for (const round of s.rounds) {
      expect(round.courts.every(isSingleGender)).toBe(true);
    }
  });

  it('puts a couple back together on the ordinary rounds either side', () => {
    // Gendered on rounds 2 and 4, so the ordinary rounds either side of the
    // first one are 1 and 3.
    const plan: RoundPlan = [null, 'gendered', null, 'gendered'];
    const s = generateSchedule(roster(8, 8), 4, 4, plan, couple(0, 8));
    expect(s.rounds[1].roundType).toBe('gendered');
    expect(s.rounds[0].roundType).toBeUndefined();
    expect(together(s.rounds[0], 'p0', 'p8')).toBe(true);
    expect(s.rounds[2].roundType).toBeUndefined();
    expect(together(s.rounds[2], 'p0', 'p8')).toBe(true);
  });
});
