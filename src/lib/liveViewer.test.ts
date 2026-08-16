/**
 * Reading somebody else's session.
 *
 * This is the only document in the app that arrives over a network rather than
 * out of the browser's own storage, and the viewer walks straight into
 * `rounds[i].courts[j].team1[k].name`. So the tests here are mostly about what
 * happens when what comes back is not what was expected: a newer app's
 * document, a truncated one, a null. Every one of those has to end as a
 * sentence on screen, because the alternative is a blank page inside the error
 * boundary for somebody who only scanned a code at a court.
 */
import { describe, it, expect, vi } from 'vitest';
import { sessionSnapshot, withholdPrivate, SNAPSHOT_VERSION } from './sessionSnapshot';
import type { Player, Schedule } from '../types';

let answer: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let asked: unknown = null;
let configured = true;

vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => configured,
  getSupabase: () =>
    Promise.resolve({
      rpc(name: string, args: unknown) {
        asked = { name, args };
        if (answer.error) return Promise.reject(new Error(answer.error.message));
        return Promise.resolve({ data: answer.data, error: null });
      }
    })
}));

const { fetchShared, read, checkCode, submitScoreEdit } = await import('./liveViewer');

function player(name: string): Player {
  return { id: `id-${name}`, name, rating: 4, gender: 'F', rosterIds: [] };
}

const players = [player('Ava'), player('Ben'), player('Cara'), player('Dee')];

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
          score: { team1: 11, team2: 7 }
        }
      ],
      sitOuts: []
    }
  ]
};

/** Exactly what liveSession publishes: built, then redacted, then serialised. */
const published = JSON.parse(
  JSON.stringify(
    withholdPrivate(
      sessionSnapshot({
        sessionId: 'sess-1',
        schedule,
        completedRounds: [1],
        players,
        scoringEnabled: true
      })
    )
  )
);

describe('asking for a session', () => {
  it('asks by key and nothing else', async () => {
    answer = { data: published, error: null };
    await fetchShared('ABCDEFGHJK');
    expect(asked).toEqual({ name: 'shared_session', args: { key: 'ABCDEFGHJK' } });
  });

  it('hands back what the host published', async () => {
    answer = { data: published, error: null };
    const got = await fetchShared('ABCDEFGHJK');
    expect(got.state).toBe('ok');
    if (got.state !== 'ok') throw new Error('not ok');
    expect(got.snapshot.schedule.rounds[0].courts[0].score).toEqual({ team1: 11, team2: 7 });
    expect(got.snapshot.completedRounds).toEqual([1]);
    expect(got.snapshot.scoringEnabled).toBe(true);
  });

  it('is gone for a key nothing answers to', async () => {
    // Never existed, expired, or stopped. The function will not say which, so
    // neither can this.
    answer = { data: null, error: null };
    expect(await fetchShared('ABCDEFGHJK')).toEqual({ state: 'gone' });
  });

  it('is offline rather than broken when the request cannot be made', async () => {
    answer = { data: null, error: { message: 'Failed to fetch' } };
    expect(await fetchShared('ABCDEFGHJK')).toEqual({ state: 'offline' });
  });

  it('is an error, in words, when the database refuses', async () => {
    answer = { data: null, error: { message: 'function does not exist' } };
    const got = await fetchShared('ABCDEFGHJK');
    expect(got.state).toBe('error');
    if (got.state !== 'error') throw new Error('not an error');
    // Not the database's words. Nobody scanning a QR code at a court can do
    // anything with "function public.shared_session(text) does not exist".
    expect(got.message).toBe('Could not load this session just now.');
  });

  it('says so when the app was built without a database at all', async () => {
    configured = false;
    const got = await fetchShared('ABCDEFGHJK');
    expect(got.state).toBe('error');
    configured = true;
  });
});

describe('checking what came back', () => {
  it('refuses a document from a newer app, and says which it is', () => {
    // The one case with its own state. "Reload for the new version" is
    // actionable; "this link has ended" would be a lie.
    expect(read({ ...published, version: SNAPSHOT_VERSION + 1 })).toEqual({ state: 'outdated' });
  });

  it('accepts its own version', () => {
    expect(read(published).state).toBe('ok');
  });

  it('refuses a document with no version, which cannot be read safely', () => {
    const noVersion = JSON.parse(JSON.stringify(published));
    delete noVersion.version;
    expect(read(noVersion).state).toBe('gone');
  });

  it('refuses one with no rounds to walk', () => {
    expect(read({ ...published, schedule: {} }).state).toBe('gone');
    expect(read({ ...published, schedule: null }).state).toBe('gone');
  });

  it('refuses a round whose court has no teams', () => {
    // The exact shape the viewer indexes into. A court missing team2 renders as
    // a crash rather than as an empty side.
    const broken = JSON.parse(JSON.stringify(published));
    delete broken.schedule.rounds[0].courts[0].team2;
    expect(read(broken).state).toBe('gone');
  });

  it('refuses a round with no sit-out list', () => {
    const broken = JSON.parse(JSON.stringify(published));
    delete broken.schedule.rounds[0].sitOuts;
    expect(read(broken).state).toBe('gone');
  });

  it('refuses a player with no name', () => {
    const broken = JSON.parse(JSON.stringify(published));
    delete broken.schedule.rounds[0].courts[0].team1[0].name;
    expect(read(broken).state).toBe('gone');
  });

  it('refuses things that are not documents', () => {
    expect(read(null).state).toBe('gone');
    expect(read('a string').state).toBe('gone');
    expect(read(42).state).toBe('gone');
    expect(read([]).state).toBe('gone');
  });

  it('takes a document that is missing only the soft parts', () => {
    // completedRounds and sessionId are read for display, not walked into. A
    // link that works should not stop working because one of them is absent.
    const thin = JSON.parse(JSON.stringify(published));
    delete thin.completedRounds;
    delete thin.sessionId;
    delete thin.scoringEnabled;
    const got = read(thin);
    expect(got.state).toBe('ok');
    if (got.state !== 'ok') throw new Error('not ok');
    expect(got.snapshot.completedRounds).toEqual([]);
    expect(got.snapshot.sessionId).toBeNull();
    expect(got.snapshot.scoringEnabled).toBe(false);
  });

  it('still takes an older document that carries ratings', () => {
    // Redaction is the publisher's job, and a link minted before it existed is
    // still a link somebody has. Refusing it here would break a working share
    // to enforce a rule that only applies at the other end.
    const withRatings = JSON.parse(JSON.stringify(published));
    withRatings.players[0].rating = 4.5;
    expect(read(withRatings).state).toBe('ok');
  });

  it('takes a missing editing flag as off, which is every session before today', () => {
    const older = JSON.parse(JSON.stringify(published));
    delete older.scoreEditing;
    const got = read(older);
    if (got.state !== 'ok') throw new Error('not ok');
    expect(got.snapshot.scoreEditing).toBe(false);
  });

  it('wants the flag to be true and not merely truthy', () => {
    // It decides whether a score is a button. A string or a 1 arriving from
    // somewhere unexpected should not open the prompt.
    for (const value of ['true', 1, {}]) {
      const odd = JSON.parse(JSON.stringify(published));
      odd.scoreEditing = value;
      const got = read(odd);
      if (got.state !== 'ok') throw new Error('not ok');
      expect(got.snapshot.scoreEditing, JSON.stringify(value)).toBe(false);
    }

    const on = JSON.parse(JSON.stringify(published));
    on.scoreEditing = true;
    const got = read(on);
    if (got.state !== 'ok') throw new Error('not ok');
    expect(got.snapshot.scoreEditing).toBe(true);
  });
});

// ------------------------------------------------------------ editing a score --

describe('offering a code', () => {
  it('asks with the key and the code, and nothing else', async () => {
    answer = { data: true, error: null };
    await checkCode('ABCDEFGHJK', '4719');
    expect(asked).toEqual({
      name: 'share_code_ok',
      args: { key: 'ABCDEFGHJK', code: '4719' }
    });
  });

  it('takes true for an answer and nothing else', async () => {
    answer = { data: true, error: null };
    expect(await checkCode('ABCDEFGHJK', '4719')).toBe('ok');

    // The function returns false for a wrong code, an expired share and a key
    // that was never real, and the caller is told the same thing for all three.
    answer = { data: false, error: null };
    expect(await checkCode('ABCDEFGHJK', '0000')).toBe('wrong');

    // Anything that is not the boolean it promised is not a yes.
    answer = { data: null, error: null };
    expect(await checkCode('ABCDEFGHJK', '4719')).toBe('wrong');
  });

  it('tells a lost connection apart from a refusal', async () => {
    answer = { data: null, error: { message: 'Failed to fetch' } };
    expect(await checkCode('ABCDEFGHJK', '4719')).toBe('offline');

    answer = { data: null, error: { message: 'something else went wrong' } };
    expect(await checkCode('ABCDEFGHJK', '4719')).toBe('error');
  });
});

describe('sending a score', () => {
  it('names the arguments the way the function does, not the way the columns do', async () => {
    answer = { data: true, error: null };
    await submitScoreEdit('ABCDEFGHJK', '4719', 2, 1, 11, 9);

    // 0007 shortened these deliberately: an argument named after a column it
    // inserts into is either ambiguous inside the function or silently the
    // column. Sending round_index here would be a 404 from PostgREST, which
    // this test is the only thing standing between us and.
    expect(asked).toEqual({
      name: 'submit_score_edit',
      args: {
        key: 'ABCDEFGHJK',
        code: '4719',
        round_idx: 2,
        court_idx: 1,
        score1: 11,
        score2: 9
      }
    });
  });

  it('sends the code every time, rather than trusting the phone that checked it', async () => {
    answer = { data: true, error: null };
    await submitScoreEdit('ABCDEFGHJK', '4719', 0, 0, 11, 9);
    expect((asked as { args: { code: string } }).args.code).toBe('4719');
  });

  it('reads false as refused, whatever the reason was', async () => {
    answer = { data: true, error: null };
    expect(await submitScoreEdit('ABCDEFGHJK', '4719', 0, 0, 11, 9)).toBe('saved');

    answer = { data: false, error: null };
    expect(await submitScoreEdit('ABCDEFGHJK', '0000', 0, 0, 11, 9)).toBe('refused');
  });

  it('tells a lost connection apart from a refusal', async () => {
    answer = { data: null, error: { message: 'Load failed' } };
    expect(await submitScoreEdit('ABCDEFGHJK', '4719', 0, 0, 11, 9)).toBe('offline');

    answer = { data: null, error: { message: 'permission denied' } };
    expect(await submitScoreEdit('ABCDEFGHJK', '4719', 0, 0, 11, 9)).toBe('error');
  });
});
