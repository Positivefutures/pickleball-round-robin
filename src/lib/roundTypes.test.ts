import { describe, it, expect } from 'vitest';
import type { CourtAssignment, Gender, Player, Round } from '../types';
import {
  NORMAL_ROUND_META, ROUND_TYPE_META, courtMatchesType, courtMissHeadline, courtMissReason,
  pillMeta,
  roundTypeOf,
} from './roundTypes';


describe('pillMeta', () => {
  it('gives a type its own badge and colours', () => {
    expect(pillMeta('gendered')).toEqual({
      badge: ROUND_TYPE_META.gendered.badge,
      shortName: ROUND_TYPE_META.gendered.shortName,
      description: ROUND_TYPE_META.gendered.description,
      badgeClass: ROUND_TYPE_META.gendered.badgeClass,
      badgeEdgeClass: ROUND_TYPE_META.gendered.badgeEdgeClass,
    });
  });

  it('gives a round with no type the grey Normal pill', () => {
    expect(pillMeta(null)).toEqual({
      badge: 'Normal Round',
      // The list draws the short one: "Gendered Round" beside ROUND 4 wrapped
      // the round number onto two lines on a phone.
      shortName: 'Normal',
      // Normal carries a line of its own so the ⓘ panel can describe the thing
      // most of the afternoon is, not only the three exceptions to it.
      description: NORMAL_ROUND_META.description,
      badgeClass: NORMAL_ROUND_META.badgeClass,
      badgeEdgeClass: NORMAL_ROUND_META.badgeEdgeClass,
    });
  });

  it('draws Normal in grey, which is none of the three type colours', () => {
    const coloured = Object.values(ROUND_TYPE_META).map((m) => m.badgeClass);
    expect(coloured).not.toContain(pillMeta(null).badgeClass);
  });
});

describe('roundTypeOf', () => {
  const bare = { roundNumber: 1, courts: [], sitOuts: [] };

  it('reads a round built by this version', () => {
    expect(roundTypeOf({ ...bare, roundType: 'mixed' })).toBe('mixed');
  });

  it('reads a schedule saved before round types were named', () => {
    expect(roundTypeOf({ ...bare, isGendered: true })).toBe('gendered');
  });

  it('returns nothing for an ordinary round', () => {
    expect(roundTypeOf(bare)).toBeNull();
  });
});

describe('courtMatchesType', () => {
  const player = (gender: Gender, rating = 4.0): Player =>
    ({ id: `${gender}${rating}${Math.random()}`, name: 'P', rating, gender, rosterIds: ['r1'] });

  const court = (g1: Gender, g2: Gender, g3: Gender, g4: Gender): CourtAssignment => ({
    courtNumber: 1,
    team1: [player(g1), player(g2)],
    team2: [player(g3), player(g4)],
    ratingDiff: 0,
  });

  it('accepts a court of one gender on a gendered round', () => {
    expect(courtMatchesType(court('M', 'M', 'M', 'M'), 'gendered')).toBe(true);
    expect(courtMatchesType(court('F', 'F', 'F', 'F'), 'gendered')).toBe(true);
  });

  it('rejects the leftovers a gendered round could not fill', () => {
    expect(courtMatchesType(court('M', 'F', 'M', 'F'), 'gendered')).toBe(false);
    // Men against women is not men playing men, however tidy the teams look.
    expect(courtMatchesType(court('M', 'M', 'F', 'F'), 'gendered')).toBe(false);
  });

  it('wants one of each gender on both teams of a mixed round', () => {
    expect(courtMatchesType(court('M', 'F', 'F', 'M'), 'mixed')).toBe(true);
    expect(courtMatchesType(court('M', 'M', 'F', 'F'), 'mixed')).toBe(false);
    expect(courtMatchesType(court('M', 'F', 'M', 'M'), 'mixed')).toBe(false);
  });

  it('takes every court of a skill round, which is a band by construction', () => {
    expect(courtMatchesType(court('M', 'F', 'M', 'F'), 'skill')).toBe(true);
  });

  it('rejects a short-handed mixed court rather than reading past the end', () => {
    const short: CourtAssignment = {
      courtNumber: 1,
      team1: [player('M')],
      team2: [player('F'), player('M')],
      ratingDiff: 0,
    };
    expect(courtMatchesType(short, 'mixed')).toBe(false);
  });
});

describe('courtMissReason', () => {
  const player = (gender: Gender): Player =>
    ({ id: `${gender}${Math.random()}`, name: 'P', rating: 4, gender, rosterIds: ['r1'] });

  const court = (...genders: Gender[]): CourtAssignment => ({
    courtNumber: 1,
    team1: genders.slice(0, 2).map(player),
    team2: genders.slice(2).map(player),
    ratingDiff: 0,
  });

  const round = (courts: CourtAssignment[], sitOuts: Gender[] = []): Round => ({
    roundNumber: 1,
    courts,
    sitOuts: sitOuts.map(player),
  });

  it('says nothing about a court that is playing the format', () => {
    const mens = court('M', 'M', 'M', 'M');
    expect(courtMissReason(round([mens]), 'gendered', mens)).toBeNull();
  });

  it('says nothing about a skill round, where every court is a band', () => {
    const any = court('M', 'F', 'M', 'F');
    expect(courtMissReason(round([any]), 'skill', any)).toBeNull();
  });

  it('counts the leftovers of a gendered round, court and bench together', () => {
    // Seven men and seven women on three courts: one men's court, one women's,
    // and the three of each left over cannot make a third.
    const mens = court('M', 'M', 'M', 'M');
    const womens = court('F', 'F', 'F', 'F');
    const spare = court('M', 'F', 'M', 'F');
    const r = round([mens, womens, spare], ['M', 'F']);
    expect(courtMissReason(r, 'gendered', spare)).toBe(
      'A gendered game needs four men or four women. The 3 men and 3 women left over cannot make one.'
    );
  });

  it('counts the leftovers of a mixed round the same way', () => {
    const m1 = court('M', 'F', 'F', 'M');
    const m2 = court('F', 'M', 'M', 'F');
    const spare = court('M', 'M', 'M', 'F');
    const r = round([m1, m2, spare], ['M', 'M']);
    expect(courtMissReason(r, 'mixed', spare)).toBe(
      'A mixed game needs two men and two women. The 5 men and 1 woman left over cannot make one.'
    );
  });

  it('speaks of one man and one woman, not of 1 men', () => {
    const mixed = court('M', 'F', 'F', 'M');
    const spare = court('M', 'F');
    const r = round([mixed, spare]);
    expect(courtMissReason(r, 'mixed', spare)).toContain('The 1 man and 1 woman left over');
  });

  it('leaves out a gender nobody is', () => {
    // A gendered round that ran out of men part way through a court.
    const womens = court('F', 'F', 'F', 'F');
    const spare = court('M', 'M', 'M');
    const r = round([womens, spare]);
    expect(courtMissReason(r, 'gendered', spare)).toBe(
      'A gendered game needs four men or four women. The 3 men left over cannot make one.'
    );
  });

  it('does not call the whole round leftovers when the format never happened', () => {
    // Nine men and one woman: no mixed court is possible at all, so there is
    // nothing for these players to be left over from.
    const a = court('M', 'M', 'M', 'M');
    const b = court('M', 'M', 'M', 'F');
    const r = round([a, b], ['M', 'M']);
    expect(courtMissReason(r, 'mixed', a)).toBe(
      'A mixed game needs two men and two women. This round has 9 men and 1 woman.'
    );
  });

  it('reads the round as it stands, so a swap changes the answer', () => {
    // No memory of what the scheduler was thinking: a saved session has none,
    // and a host who moves two players by hand would make it wrong.
    const before = court('M', 'M', 'M', 'M');
    const spare = court('M', 'F', 'M', 'F');
    expect(courtMissReason(round([before, spare], ['F', 'F']), 'gendered', spare)).toContain(
      '2 men and 4 women left over'
    );
    // The same round with one of the sit-outs swapped onto the leftover court.
    const swapped = court('M', 'F', 'F', 'F');
    expect(courtMissReason(round([before, swapped], ['F', 'M']), 'gendered', swapped)).toContain(
      '2 men and 4 women left over'
    );
  });
});

describe('courtMissHeadline', () => {
  it('names the format that could not be made', () => {
    expect(courtMissHeadline('gendered', true)).toBe('Unable to make last game gendered');
    expect(courtMissHeadline('mixed', true)).toBe('Unable to make last game mixed');
  });

  it('says "this game" of a court with another one under it', () => {
    // Two courts the format could not make. Only the bottom one is the last
    // game, and calling the one above it that would be a plain untruth.
    expect(courtMissHeadline('mixed', false)).toBe('Unable to make this game mixed');
  });
});

