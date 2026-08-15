/**
 * What costs the host their schedule, and what does not.
 *
 * The whole point of this key is the second half of that sentence. A door back
 * to a schedule is only worth having if it stays open through the ordinary
 * fiddling of an evening — a name typed in wrong, the score toggle, somebody
 * added to the group who is not playing. So most of what is here is the list of
 * things that must NOT close it.
 */
import { describe, it, expect } from 'vitest';
import { basisKey, scheduleIsStale, hasGenderedRound } from './scheduleBasis';
import type { BasisInput } from './scheduleBasis';
import type { Player, Schedule, SpecialGameTypes, RoundType } from '../types';

function player(id: string, gender: 'M' | 'F' = 'M', rating = 3.5): Player {
  return { id, name: `Player ${id}`, rating, gender, rosterIds: ['g1'] };
}

const four = [player('a'), player('b'), player('c', 'F'), player('d', 'F')];

const types: SpecialGameTypes = {
  gendered: { enabled: false, frequency: 4, order: 0 },
  mixed: { enabled: false, frequency: 4, order: 1 },
  skill: { enabled: false, frequency: 4, order: 2 },
};

function schedule(roundType?: RoundType): Schedule {
  return {
    rounds: [
      {
        roundNumber: 1,
        courts: [
          {
            courtNumber: 1,
            team1: [four[0], four[1]],
            team2: [four[2], four[3]],
            ratingDiff: 0,
          },
        ],
        sitOuts: [],
        ...(roundType ? { roundType } : {}),
      },
    ],
  };
}

function basis(over: Partial<BasisInput> = {}): BasisInput {
  return {
    rosterId: 'g1',
    attending: four,
    partnerships: [],
    numCourts: 1,
    numRounds: 1,
    specialTypes: types,
    schedule: schedule(),
    ...over,
  };
}

/** Did this change close the door? */
function stale(over: Partial<BasisInput>): boolean {
  return scheduleIsStale(basisKey(basis()), basis(over));
}

describe('what the schedule was built from', () => {
  it('is the same key twice for the same session', () => {
    expect(basisKey(basis())).toBe(basisKey(basis()));
  });

  it('does not care what order the players were ticked in', () => {
    // Tapping the list bottom-up is the same session as tapping it top-down.
    const reversed = [...four].reverse();
    expect(basisKey(basis({ attending: reversed }))).toBe(basisKey(basis()));
  });

  it('does not care which way round a couple was tapped', () => {
    const one = basis({ partnerships: [{ player1Id: 'a', player2Id: 'b' }] });
    const other = basis({ partnerships: [{ player1Id: 'b', player2Id: 'a' }] });
    expect(basisKey(one)).toBe(basisKey(other));
  });
});

describe('changes that cost the schedule', () => {
  it('a player unticked', () => {
    expect(stale({ attending: four.slice(0, 3) })).toBe(true);
  });

  it('a player added to the session', () => {
    expect(stale({ attending: [...four, player('e')] })).toBe(true);
  });

  it('a couple made', () => {
    expect(stale({ partnerships: [{ player1Id: 'a', player2Id: 'b' }] })).toBe(true);
  });

  it('but not a couple that was never playing', () => {
    // The store keeps couples the current selection has nothing to do with, and
    // an effect tidies them away a render later. Counting them would mean the
    // tab shutting on its own a beat after the app decided it should stay open.
    const withGhost = basis({
      partnerships: [{ player1Id: 'y', player2Id: 'z' }],
    });
    expect(scheduleIsStale(basisKey(basis()), withGhost)).toBe(false);
  });

  it('a court added or taken away', () => {
    expect(stale({ numCourts: 2 })).toBe(true);
  });

  it('a different number of rounds', () => {
    expect(stale({ numRounds: 8 })).toBe(true);
  });

  it('a round type switched on', () => {
    const on = { ...types, gendered: { ...types.gendered, enabled: true } };
    expect(stale({ specialTypes: on })).toBe(true);
  });

  it('a round type played more often', () => {
    const often = { ...types, gendered: { ...types.gendered, frequency: 2 } };
    expect(stale({ specialTypes: often })).toBe(true);
  });

  it('a different group', () => {
    expect(stale({ rosterId: 'g2' })).toBe(true);
  });
});

describe('changes the schedule survives', () => {
  it('somebody renamed', () => {
    const renamed = four.map((p) => ({ ...p, name: 'Corrected' }));
    expect(stale({ attending: renamed })).toBe(false);
  });

  it('a rating corrected', () => {
    // Every schedule is balanced on ratings, so keying on them would mean one
    // nudged number cost the host the afternoon. The court is still playable.
    const rerated = four.map((p) => ({ ...p, rating: 4.5 }));
    expect(stale({ attending: rerated })).toBe(false);
  });

  it('a gender corrected, when no round was built around gender', () => {
    const swapped = [{ ...four[0], gender: 'F' as const }, ...four.slice(1)];
    expect(stale({ attending: swapped })).toBe(false);
  });
});

describe('gender, on a schedule that was built around it', () => {
  function withGendered(over: Partial<BasisInput> = {}): BasisInput {
    return basis({ schedule: schedule('gendered'), ...over });
  }

  it('costs the schedule when somebody changes', () => {
    const swapped = [{ ...four[0], gender: 'F' as const }, ...four.slice(1)];
    expect(
      scheduleIsStale(basisKey(withGendered()), withGendered({ attending: swapped }))
    ).toBe(true);
  });

  it('leaves it alone when nobody changes', () => {
    expect(scheduleIsStale(basisKey(withGendered()), withGendered())).toBe(false);
  });

  it('counts a mixed round too', () => {
    expect(hasGenderedRound(schedule('mixed'))).toBe(true);
  });

  it('does not count a skill round, which is about ratings', () => {
    expect(hasGenderedRound(schedule('skill'))).toBe(false);
  });

  it('reads a schedule saved before roundType existed', () => {
    // Older builds wrote isGendered instead, and those schedules are still in
    // people's phones.
    const legacy: Schedule = {
      rounds: [{ ...schedule().rounds[0], isGendered: true }],
    };
    expect(hasGenderedRound(legacy)).toBe(true);
  });
});

describe('a session with nothing recorded', () => {
  it('is stale, rather than trusted', () => {
    // A session parked by a build that wrote no basis. The schedule is real,
    // but nothing says what it was built from, so the door cannot be promised.
    expect(scheduleIsStale(null, basis())).toBe(true);
  });
});
