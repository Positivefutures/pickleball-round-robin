import { describe, it, expect } from 'vitest';
import { sessionSnapshot, withholdPrivate, SNAPSHOT_VERSION } from './sessionSnapshot';
import { standings } from './standings';
import type { Player, Schedule } from '../types';

// Every rating below is distinctive on purpose. The redaction test looks for
// them in the serialised document rather than at any one field, because a
// player is reached from three places and missing one of them is the bug.
function player(name: string, rating: number, guest?: true): Player {
  const p: Player = { id: `id-${name}`, name, rating, gender: 'F', rosterIds: ['g1'] };
  if (guest) p.guest = guest;
  return p;
}

const players = [
  player('Ava', 3.11),
  player('Ben', 3.22),
  player('Cara', 3.33),
  player('Sam', 3.44, true),
  player('Dee', 3.55),
];

const RATINGS = players.map((p) => String(p.rating));

const schedule: Schedule = {
  rounds: [
    {
      roundNumber: 1,
      courts: [
        {
          courtNumber: 1,
          team1: [players[0], players[1]],
          team2: [players[2], players[3]],
          ratingDiff: 0.77,
          score: { team1: 11, team2: 7 },
        },
      ],
      sitOuts: [players[4]],
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

describe('withholding what is private', () => {
  const published = withholdPrivate(sessionSnapshot(input));
  const asSent = JSON.stringify(published);
  // The same document with its timestamp dropped, for the searches that look
  // for things which must not appear.
  //
  // `at` is an ISO timestamp whose digits collide with the very numbers being
  // looked for: a document written at 17:49:53.111 contains "3.11", and one
  // written at 20.770 contains "0.77". That reddened the suite at random a few
  // times per thousand runs, and never had anything to do with redaction, which
  // does not touch `at`. Kept apart from asSent so that "is still plain data"
  // goes on checking what is really sent.
  const searched = JSON.stringify({ ...published, at: undefined });

  it('sends no rating anywhere in the document', () => {
    // The assertion that matters, and the reason it looks at the string rather
    // than at fields: the same player is in the roll, on a team and in the
    // sit-outs, and a redaction that misses one of those looks correct
    // everywhere a test would think to check.
    for (const rating of RATINGS) {
      expect(searched).not.toContain(rating);
    }
  });

  it('sends no court rating gap, which is the same fact added up', () => {
    expect(searched).not.toContain('0.77');
    expect(published.schedule.rounds[0].courts[0].ratingDiff).toBe(0);
  });

  it('sends no group ids, which would tie two afternoons to one host', () => {
    expect(searched).not.toContain('g1');
    expect(published.players.every((p) => p.rosterIds.length === 0)).toBe(true);
  });

  it('leaves the host copy alone', () => {
    // withholdPrivate returns a new document. If it edited in place, the host's
    // own screen would lose every rating the moment they tapped Share.
    expect(players[0].rating).toBe(3.11);
    expect(schedule.rounds[0].courts[0].ratingDiff).toBe(0.77);
    expect(schedule.rounds[0].courts[0].team1[0].rating).toBe(3.11);
  });

  it('keeps the names, the scores and the sit-outs', () => {
    expect(asSent).toContain('Ava');
    expect(published.schedule.rounds[0].courts[0].score).toEqual({ team1: 11, team2: 7 });
    expect(published.schedule.rounds[0].sitOuts[0].name).toBe('Dee');
  });

  it('keeps a guest a guest', () => {
    expect(published.players.find((p) => p.name === 'Sam')?.guest).toBe(true);
  });

  it('still ranks the same, which is what proves nothing needed was thrown away', () => {
    // The viewer computes standings from the published document. If redaction
    // took something standings() reads, the table on a watcher's phone would
    // disagree with the one on the host's.
    const host = standings(input.schedule, input.players);
    const watcher = standings(published.schedule, published.players);
    expect(watcher.map((r) => [r.player.name, r.wins, r.losses, r.differential])).toEqual(
      host.map((r) => [r.player.name, r.wins, r.losses, r.differential])
    );
  });

  it('is still plain data', () => {
    expect(JSON.parse(asSent)).toEqual(published);
  });
});
