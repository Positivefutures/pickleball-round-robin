import { describe, it, expect } from 'vitest';
import { sessionSnapshot, SNAPSHOT_VERSION } from './sessionSnapshot';
import type { Player, Schedule } from '../types';

function player(name: string, guest?: true): Player {
  const p: Player = { id: `id-${name}`, name, rating: 4.25, gender: 'F', rosterIds: ['g1'] };
  if (guest) p.guest = guest;
  return p;
}

const players = [player('Ava'), player('Ben'), player('Cara'), player('Sam', true)];

const schedule: Schedule = {
  rounds: [
    {
      roundNumber: 1,
      courts: [
        {
          courtNumber: 1,
          team1: [players[0], players[1]],
          team2: [players[2], players[3]],
          ratingDiff: 0,
          score: { team1: 11, team2: 7 },
        },
      ],
      sitOuts: [],
      roundType: 'mixed',
    },
  ],
};

const input = {
  sessionId: 'sess-1',
  schedule,
  completedRounds: [1],
  players,
  scoringEnabled: true,
};

describe('sessionSnapshot', () => {
  it('stamps a version, so a document can always say what shape it is', () => {
    expect(sessionSnapshot(input).version).toBe(SNAPSHOT_VERSION);
  });

  it('stamps the time it was taken', () => {
    const at = new Date('2026-08-10T18:30:00.000Z');
    expect(sessionSnapshot(input, at).at).toBe('2026-08-10T18:30:00.000Z');
  });

  it('survives a round trip through JSON with nothing lost', () => {
    // The whole point of the shape. If this ever fails, something in a session
    // has stopped being plain data and cannot be published.
    const taken = sessionSnapshot(input, new Date('2026-08-10T18:30:00.000Z'));
    expect(JSON.parse(JSON.stringify(taken))).toEqual(taken);
  });

  it('carries the scores, which ride inside the schedule rather than beside it', () => {
    const back = JSON.parse(JSON.stringify(sessionSnapshot(input)));
    expect(back.schedule.rounds[0].courts[0].score).toEqual({ team1: 11, team2: 7 });
  });

  it('carries the guests, who are in nobody group and would otherwise vanish', () => {
    const back = JSON.parse(JSON.stringify(sessionSnapshot(input)));
    expect(back.players.find((p: Player) => p.name === 'Sam').guest).toBe(true);
  });
});
