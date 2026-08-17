/**
 * @vitest-environment happy-dom
 *
 * Somebody else's session, read-only.
 *
 * The assertion that matters here is a negative one: no rating and no balance
 * bar anywhere on the page. Everything else about this view is visible the
 * moment you look at it, and that one is not — a leak would look exactly like a
 * working viewer, because the numbers would be sitting in the document rather
 * than on the screen.
 *
 * After that it is about the states nobody plans for. A link that has ended and
 * a request that failed are the ordinary experience of a QR code photographed
 * an hour ago, and both have to be a sentence rather than a blank page.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { LiveFetch } from '../../lib/liveViewer';
import type { SharedRoundTimer } from '../../lib/sessionSnapshot';
import type { Player, Schedule } from '../../types';

let answer: LiveFetch = { state: 'gone' };
let asks = 0;
/** Cheap probes, counted apart from the fetches they save. */
let probes = 0;
/** A database without 0009 on it, where there is no probe to ask. */
let probeUnavailable = false;
/** What the database says about a code, and about a score sent to it. */
let codeAnswer = 'ok';
let editAnswer = 'saved';
let offered: { key: string; code: string }[] = [];
let sent: unknown[][] = [];

/** Every start and stop the page asks the alarm layer for, in order. */
let alarms: string[] = [];

// Only the three that would reach the audio hardware. happy-dom has no
// AudioContext, and what is being checked here is whether this page asks for a
// noise at all — which it never used to.
vi.mock('../../lib/alarmSounds', async () => {
  const actual =
    await vi.importActual<typeof import('../../lib/alarmSounds')>('../../lib/alarmSounds');
  return {
    ...actual,
    startAlarmLoop: (id: string) => void alarms.push(`start:${id}`),
    stopAlarmLoop: () => void alarms.push('stop'),
    warmUpAudio: () => {},
    previewTone: () => {}
  };
});

vi.mock('../../lib/liveViewer', () => ({
  fetchShared: (key: string) => {
    asks += 1;
    void key;
    return Promise.resolve(answer);
  },
  /**
   * The cheap probe, answering off the same `answer` the fetch does — which is
   * the database, as far as this file is concerned. So a test that swaps in a
   * new snapshot moves the timestamp and the page pulls it, and a test that
   * does not leaves it still and the page pulls nothing. That second half is
   * the behaviour worth having a stand-in for at all.
   */
  fetchSharedAt: () => {
    probes += 1;
    if (probeUnavailable) return Promise.resolve({ state: 'unavailable' as const });
    return Promise.resolve(
      answer.state === 'ok'
        ? { state: 'at' as const, at: Date.parse(answer.snapshot.at) }
        : { state: 'gone' as const }
    );
  },
  checkCode: (key: string, code: string) => {
    offered.push({ key, code });
    return Promise.resolve(codeAnswer);
  },
  submitScoreEdit: (...args: unknown[]) => {
    sent.push(args);
    return Promise.resolve(editAnswer);
  }
}));

const { LiveSessionPage } = await import('./LiveSessionPage');
const { sessionSnapshot, withholdPrivate } = await import('../../lib/sessionSnapshot');

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Distinctive, so a leak is findable in the rendered text rather than only in a
// field somebody thought to check.
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
  player('Dee', 3.55)
];

function schedule(score?: { team1: number; team2: number }): Schedule {
  return {
    rounds: [
      {
        roundNumber: 1,
        courts: [
          {
            courtNumber: 7,
            team1: [players[0], players[1]],
            team2: [players[2], players[3]],
            ratingDiff: 0.77,
            ...(score ? { score } : {})
          }
        ],
        sitOuts: [players[4]]
      },
      { roundNumber: 2, courts: [], sitOuts: [] }
    ]
  };
}

/** Exactly what the host publishes: built here, then redacted, as liveSession does. */
function shared(
  score?: { team1: number; team2: number },
  scoreEditing = false,
  roundTimer: SharedRoundTimer | null = null
): LiveFetch {
  return {
    state: 'ok',
    snapshot: withholdPrivate(
      sessionSnapshot({
        sessionId: 'sess-1',
        schedule: schedule(score),
        completedRounds: [1],
        players,
        scoringEnabled: true,
        scoreEditing,
        roundTimer
      })
    )
  };
}

let root: Root;
let container: HTMLElement;

async function open() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(LiveSessionPage, { shareKey: 'ABCDEFGHJK' }));
  });
  return container;
}

const text = () => container.textContent ?? '';

beforeEach(() => {
  asks = 0;
  probes = 0;
  probeUnavailable = false;
  answer = { state: 'gone' };
  codeAnswer = 'ok';
  editAnswer = 'saved';
  offered = [];
  sent = [];
  alarms = [];
  window.localStorage.clear();
});

// ------------------------------------------ reaching a score from this page --

/** The board on a court, once it is something you can press. */
const boards = () => [
  ...container.querySelectorAll<HTMLButtonElement>('button[aria-label*="Change it"]')
];

/**
 * One key on the score dialog's own pad.
 *
 * Scoped to the pad, and it has to be: each side of the board is itself a
 * button, so once team one reads 1 there are two buttons on screen reading 1
 * and the first of them is the panel.
 */
function key(text: string): HTMLButtonElement {
  const pad = container.querySelector('[aria-label="Score keypad"]');
  if (!pad) throw new Error('no keypad on screen');
  const button = [...pad.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!button) throw new Error(`no key reading ${text}`);
  return button as HTMLButtonElement;
}

/** Save, Cancel: the buttons under the pad, whose words appear nowhere else. */
function face(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text
  );
  if (!button) throw new Error(`no button reading ${text}`);
  return button as HTMLButtonElement;
}

/** Types a code into the four boxes the way a keyboard would. */
async function typeCode(digits: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!;
  for (const digit of digits) {
    const boxes = [...container.querySelectorAll('input')] as HTMLInputElement[];
    const box = (document.activeElement as HTMLInputElement) ?? boxes[0];
    await act(async () => {
      setter.call(box, digit);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
}

/**
 * Writes a score on whichever court's dialog is open, and saves it.
 *
 * Clear first, because the dialog opens holding whatever the court already
 * says and a score is two digits at most: typing over the top of 11 gets you
 * 11 again. Clear is the way a person retypes one too.
 */
async function write(team1: string, team2: string) {
  await act(async () => key('Clear').click());
  for (const digit of team1) await act(async () => key(digit).click());
  for (const digit of team2) await act(async () => key(digit).click());
  await act(async () => face('Save').click());
}

/** A fetch, without waiting twenty seconds for the interval. */
async function poll() {
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('changing a score from a watching phone', () => {
  it('leaves the scores alone when the host has not switched editing on', async () => {
    answer = shared({ team1: 11, team2: 7 });
    await open();
    expect(text()).toContain('COURT 7');
    expect(boards()).toHaveLength(0);
    expect(text()).not.toContain('Tap a score');
  });

  it('makes the score a button when the host has', async () => {
    answer = shared({ team1: 11, team2: 7 }, true);
    await open();
    expect(boards()).toHaveLength(1);
    // And says so, because a board that has always looked like this would not
    // announce itself.
    expect(text()).toContain('Tap a score to change it');
    expect(text()).toContain('You will be asked for a code');
  });

  it('says nothing about tapping when the session keeps no score', async () => {
    const off = shared(undefined, true);
    if (off.state !== 'ok') throw new Error('not ok');
    off.snapshot.scoringEnabled = false;
    answer = off;
    await open();
    expect(boards()).toHaveLength(0);
    expect(text()).not.toContain('Tap a score');
  });

  it('asks for the code, then opens the score', async () => {
    answer = shared({ team1: 11, team2: 7 }, true);
    await open();

    await act(async () => boards()[0].click());
    expect(text()).toContain('Enter the Code');
    // Nothing is sent while it is being typed.
    expect(offered).toHaveLength(0);

    await typeCode('4719');
    expect(offered).toEqual([{ key: 'ABCDEFGHJK', code: '4719' }]);
    // The fourth digit is the whole answer, so the prompt goes and the host's
    // own score dialog is what is left.
    expect(text()).not.toContain('Enter the Code');
    expect(text()).toContain('Court 7 Score');
  });

  it('keeps a wrong code out, and says so', async () => {
    codeAnswer = 'wrong';
    answer = shared({ team1: 11, team2: 7 }, true);
    await open();

    await act(async () => boards()[0].click());
    await typeCode('0000');

    expect(text()).toContain('That code is not right');
    expect(text()).not.toContain('Court 7 Score');
    // And the boxes are empty again, ready to be tried.
    const boxes = [...container.querySelectorAll('input')] as HTMLInputElement[];
    expect(boxes.map((b) => b.value).join('')).toBe('');
  });

  it('asks once, not once a court', async () => {
    answer = shared({ team1: 11, team2: 7 }, true);
    await open();

    await act(async () => boards()[0].click());
    await typeCode('4719');
    await act(async () => face('Cancel').click());

    // The second tap goes straight to the score. Being asked again for a code
    // said out loud once is what the host meant to avoid by giving it out.
    await act(async () => boards()[0].click());
    expect(text()).toContain('Court 7 Score');
    expect(offered).toHaveLength(1);
  });

  it('sends the court by position and the code with it', async () => {
    answer = shared({ team1: 11, team2: 7 }, true);
    await open();

    await act(async () => boards()[0].click());
    await typeCode('4719');
    await write('11', '9');

    expect(sent).toEqual([['ABCDEFGHJK', '4719', 0, 0, 11, 9]]);
  });

  it('shows the new score at once rather than waiting for it to come back', async () => {
    answer = shared({ team1: 11, team2: 7 }, true);
    await open();

    await act(async () => boards()[0].click());
    await typeCode('4719');
    await write('11', '9');

    // The host has not applied it and the session still says 7. Half a minute
    // of the old number is how somebody comes to type the same score twice.
    const panels = () =>
      [...container.querySelectorAll('span.tabular-nums')].map((p) => p.textContent);
    expect(panels()).toContain('9');
    expect(panels()).not.toContain('7');

    // And it survives the polls in between.
    await poll();
    expect(panels()).toContain('9');
  });

  it('lets go of its own score once the session comes back agreeing', async () => {
    answer = shared({ team1: 11, team2: 7 }, true);
    await open();
    await act(async () => boards()[0].click());
    await typeCode('4719');
    await write('11', '9');

    // The host took it and published.
    answer = shared({ team1: 11, team2: 9 }, true);
    await poll();

    // Then changed it themselves, which is what last write wins means. If this
    // phone were still holding its own number it would ignore them.
    answer = shared({ team1: 11, team2: 5 }, true);
    await poll();
    const panels = [...container.querySelectorAll('span.tabular-nums')].map((p) => p.textContent);
    expect(panels).toContain('5');
    expect(panels).not.toContain('9');
  });

  it('takes the score back when the database will not have it', async () => {
    editAnswer = 'refused';
    answer = shared({ team1: 11, team2: 7 }, true);
    await open();

    await act(async () => boards()[0].click());
    await typeCode('4719');
    await write('11', '9');

    // The old number is back, rather than a score on screen that no other phone
    // at the court will ever show.
    const panels = [...container.querySelectorAll('span.tabular-nums')].map((p) => p.textContent);
    expect(panels).toContain('7');
    expect(panels).not.toContain('9');
    expect(text()).toContain('not taking changes now');

    // And the code is asked for again, because a refusal is what a code that
    // has stopped working looks like.
    await act(async () => boards()[0].click());
    expect(text()).toContain('Enter the Code');
  });

  it('says so when the score could not be sent at all', async () => {
    editAnswer = 'offline';
    answer = shared({ team1: 11, team2: 7 }, true);
    await open();

    await act(async () => boards()[0].click());
    await typeCode('4719');
    await write('11', '9');

    expect(text()).toContain('You are offline');
    const panels = [...container.querySelectorAll('span.tabular-nums')].map((p) => p.textContent);
    expect(panels).toContain('7');
  });

  it('will not let a watcher erase a score', async () => {
    // There is no way to say "no score" to submit_score_edit, so a clearance
    // that looked like it worked would quietly not have happened.
    answer = shared({ team1: 11, team2: 7 }, true);
    await open();
    await act(async () => boards()[0].click());
    await typeCode('4719');

    await act(async () => key('Clear').click());
    expect(face('Save').disabled).toBe(true);
    await act(async () => face('Save').click());
    expect(sent).toHaveLength(0);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('watching a session', () => {
  it('shows the courts, the players and the court number the host chose', async () => {
    answer = shared({ team1: 11, team2: 7 });
    await open();
    expect(text()).toContain('COURT 7');
    expect(text()).toContain('Ava');
    expect(text()).toContain('Cara');
  });

  it('shows the score', async () => {
    answer = shared({ team1: 11, team2: 7 });
    await open();
    const panels = [...container.querySelectorAll('span.tabular-nums')].map((p) => p.textContent);
    expect(panels).toContain('11');
    expect(panels).toContain('7');
  });

  it('shows no rating and no balance bar, anywhere', async () => {
    // The requirement, and the one that cannot be seen by looking at the page.
    answer = shared({ team1: 11, team2: 7 });
    await open();
    const rendered = container.innerHTML;
    for (const rating of ['3.11', '3.22', '3.33', '3.44', '3.55', '0.77', '3.1', '4.0']) {
      expect(rendered).not.toContain(rating);
    }
    expect(rendered).not.toContain('BalanceIndicator');
    // And there is genuinely a court on screen, so the check above is not
    // passing because the page is empty.
    expect(text()).toContain('COURT 7');
  });

  it('draws no rating even when handed a document that still carries them', async () => {
    // The test above uses a redacted document, so on its own it would pass
    // against a viewer that happily printed every rating it was given. This is
    // the one that actually holds the page to it.
    //
    // Not a hypothetical: liveViewer deliberately accepts a document with
    // ratings in it, because a link minted by an older client is still a link
    // somebody has, and refusing it would break a working share. Redaction is
    // the publisher's job. Not drawing them is this page's.
    answer = {
      state: 'ok',
      snapshot: sessionSnapshot({
        sessionId: 'sess-1',
        schedule: schedule({ team1: 11, team2: 7 }),
        completedRounds: [1],
        players,
        scoringEnabled: true
      })
    };
    await open();
    const rendered = container.innerHTML;
    expect(text()).toContain('COURT 7');
    for (const rating of ['3.11', '3.22', '3.33', '3.44', '3.55', '0.77']) {
      expect(rendered).not.toContain(rating);
    }
  });

  it('shows who is sitting out', async () => {
    answer = shared();
    await open();
    expect(text()).toContain('SITTING OUT');
    expect(text()).toContain('Dee');
  });

  it('folds a round away behind its arrow and brings it back', async () => {
    answer = shared();
    await open();
    expect(text()).toContain('COURT 7');

    const fold = container.querySelector<HTMLButtonElement>('[aria-label="Hide round 1"]');
    if (!fold) throw new Error('no fold arrow on round 1');
    await act(async () => fold.click());
    expect(text()).not.toContain('COURT 7');
    // The heading stays: a folded round is still a round on the page.
    expect(text()).toContain('Round 1');

    const unfold = container.querySelector<HTMLButtonElement>('[aria-label="Show round 1"]');
    if (!unfold) throw new Error('no unfold arrow on round 1');
    await act(async () => unfold.click());
    expect(text()).toContain('COURT 7');
  });

  it('offers the way down to the standings on every open round', async () => {
    // The scoring-off case is covered where the standings themselves are:
    // no table, and no link pointing at where it would have been.
    answer = shared({ team1: 11, team2: 7 });
    await open();
    expect(text()).toContain('View Standings');
  });

  it('marks a round the host has finished', async () => {
    answer = shared();
    await open();
    expect(text()).toContain('Done');
  });

  it('keeps the rounds in playing order rather than lifting the finished ones', async () => {
    // The host's page groups completed rounds at the top. Somebody watching
    // wants to know which court they are on next.
    answer = shared();
    await open();
    // The rounds' own headings. The panel at the foot of the page carries one
    // too, and it is not a round.
    const headings = [...container.querySelectorAll('section h2')].map((h) => h.textContent);
    expect(headings).toEqual(['Round 1', 'Round 2']);
  });

  it('ranks the afternoon from the published document', async () => {
    answer = shared({ team1: 11, team2: 7 });
    await open();
    expect(text()).toContain('Standings');
  });

  it('leaves the standings out when the session does not keep score', async () => {
    const off = shared();
    if (off.state !== 'ok') throw new Error('not ok');
    off.snapshot.scoringEnabled = false;
    answer = off;
    await open();
    expect(text()).not.toContain('Standings');
  });

  it('says when it last heard anything', async () => {
    // A live view that has quietly stopped updating is worse than one that
    // admits how old it is.
    answer = shared();
    await open();
    expect(text()).toMatch(/Last Updated \d/);
  });

  it('offers the app itself at the foot of somebody else session', async () => {
    // The one thing this page is selling, and the only reason it is free to
    // watch. Both the words and the button go to the app.
    answer = shared();
    await open();
    expect(text()).toContain('Make your own round robin');
    expect(text()).toContain('Balanced matchups in seconds.');
    const open_ = [...container.querySelectorAll('a')].find(
      (a) => a.textContent === 'Create a round robin'
    );
    expect(open_?.getAttribute('href')).toBe('https://app.pbroundrobin.com/');
  });

  it('breaks the heading into two lines without running the words together', async () => {
    // The break is drawn rather than left to the panel's width, which means two
    // block spans — and two block spans put their text nodes straight up
    // against each other. Without the space between them the heading reads
    // "Make your ownround robin" to anything that takes it as text, which is
    // every screen reader and every share preview.
    answer = shared();
    await open();

    const heading = [...container.querySelectorAll('h2')].find((h) =>
      (h.textContent ?? '').includes('Make your own')
    );
    expect(heading).toBeTruthy();
    expect(heading!.textContent).toBe('Make your own round robin');
    // And it really is two lines, not one that happens to fit.
    expect(heading!.querySelectorAll('span.block')).toHaveLength(2);
  });

  it('names the app in the banner, and that name is the way to it', async () => {
    // Somebody here scanned a code at a court. The banner is the only thing on
    // the page that says what they are looking at.
    answer = shared();
    await open();
    const title = container.querySelector('h1 a');
    expect(title?.textContent).toBe('Pickleball Round Robin Generator');
    expect(title?.getAttribute('href')).toBe('https://app.pbroundrobin.com/');
  });

  it('marks itself live, so nobody wonders whether it is a screenshot', async () => {
    answer = shared();
    await open();
    expect(text()).toContain('LIVE');
  });
});

describe('when there is nothing to watch', () => {
  it('says the link has ended rather than showing a blank page', async () => {
    answer = { state: 'gone' };
    await open();
    expect(text()).toContain('This session link has ended.');
    expect(text()).not.toContain('LIVE');
  });

  it('offers a way back to the app, so the page is never a dead end', async () => {
    answer = { state: 'gone' };
    await open();
    const home = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(home).toContain('https://app.pbroundrobin.com/');
  });

  it('asks for a reload when the document is from a newer app', async () => {
    // Its own message, because "this link has ended" would be a lie and
    // reloading actually fixes it.
    answer = { state: 'outdated' };
    await open();
    expect(text()).toContain('needs a newer version');
  });

  it('says offline rather than ended when the request could not be made', async () => {
    answer = { state: 'offline' };
    await open();
    expect(text()).toContain('You are offline.');
  });

  it('shows the error in words when something else went wrong', async () => {
    answer = { state: 'error', message: 'Could not load this session just now.' };
    await open();
    expect(text()).toContain('Could not load this session just now.');
  });
});

describe('keeping up', () => {
  it('asks again on a timer, and repaints when a score lands', async () => {
    vi.useFakeTimers();
    answer = shared();
    await open();
    expect(text()).toContain('COURT 7');

    // A publish a moment later, so the document really is a later one. The page
    // asks whether anything changed before it fetches now, and two snapshots
    // stamped the same millisecond have not.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    answer = shared({ team1: 11, team2: 7 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    const panels = [...container.querySelectorAll('span.tabular-nums')].map((p) => p.textContent);
    expect(panels).toContain('11');
  });

  /**
   * What the whole arrangement is for.
   *
   * The session document is around 8KB, and its size is what set the twenty
   * second poll: asking for it every three seconds all afternoon would be
   * somebody else's data allowance. So the page asks a question that costs one
   * timestamp instead, and only fetches when the answer moves. That is what
   * lets the host's round timer land in about three seconds rather than twelve.
   */
  it('asks whether anything changed far more often than it fetches', async () => {
    vi.useFakeTimers();
    answer = shared();
    await open();
    const fetched = asks;
    const asked = probes;

    // A minute of a session where the host does nothing at all.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    // Many cheap questions...
    expect(probes - asked).toBeGreaterThan(10);
    // ...and the document itself only on the backstop, which is the polling
    // this page did before any of this existed.
    expect(asks - fetched).toBeLessThanOrEqual(3);
  });

  it('picks up a change within a few seconds, not within twenty', async () => {
    vi.useFakeTimers();
    answer = shared();
    await open();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    answer = shared({ team1: 11, team2: 7 });
    // Well inside the old poll, and the whole point of the exercise: this is
    // the host pressing START and everybody else finding out.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    const panels = [...container.querySelectorAll('span.tabular-nums')].map((p) => p.textContent);
    expect(panels).toContain('11');
  });

  /**
   * The probe is an optimisation, not a dependency. A database that has not had
   * 0009 run against it answers 'unavailable', and this page has to go on
   * working exactly as it did — which is also what makes the migration and the
   * client safe to deploy in either order.
   */
  it('falls back to polling the document when there is no probe to ask', async () => {
    vi.useFakeTimers();
    probeUnavailable = true;
    answer = shared();
    await open();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    answer = shared({ team1: 11, team2: 7 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000);
    });

    const panels = [...container.querySelectorAll('span.tabular-nums')].map((p) => p.textContent);
    expect(panels).toContain('11');
  });

  it('does not ask while the tab is in somebody else pocket', async () => {
    // A background tab is a phone in a pocket. Asking every twenty seconds all
    // afternoon would be spending somebody else's battery on nothing.
    vi.useFakeTimers();
    answer = shared();
    await open();
    const before = asks;

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(asks).toBe(before);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(asks).toBeGreaterThan(before);
  });
});

// ---------------------------------------------- the host's timer, read-only --

describe('the round timer', () => {
  const clocks = () => [
    ...container.querySelectorAll<HTMLButtonElement>('button[aria-label="Round timer"]')
  ];
  const sheet = () => container.querySelector('[role="dialog"][aria-label="Round Timer"]');

  function timing(roundNumber: number, msLeft: number): SharedRoundTimer {
    return {
      roundNumber,
      phase: 'running',
      endsAt: Date.now() + msLeft,
      remainingMs: 0,
      flashOn: true
    };
  }

  it('shows no clock on a session where nobody has started one', async () => {
    answer = shared();
    await open();
    expect(clocks()).toHaveLength(0);
  });

  it('puts a clock on the round being timed, and only that one', async () => {
    answer = shared(undefined, false, timing(2, 300_000));
    await open();

    expect(clocks()).toHaveLength(1);
    const header = clocks()[0].closest('div')?.parentElement;
    expect(header?.textContent).toContain('Round 2');
  });

  it('counts down from the deadline on this phone, not from what was published', async () => {
    // remainingMs is deliberately 0 in the published document: a watcher works
    // from the absolute deadline, which is what makes a twenty-second poll
    // enough to run a countdown that moves every second.
    answer = shared(undefined, false, timing(1, 305_000));
    await open();
    await act(async () => {
      clocks()[0].click();
    });

    expect(sheet()?.textContent).toContain('5:05');
    expect(sheet()?.textContent).toContain('Round 1 Timer');
  });

  it('offers a watcher nothing to press', async () => {
    answer = shared(undefined, false, timing(1, 60_000));
    await open();
    await act(async () => {
      clocks()[0].click();
    });

    const words = [...sheet()!.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(words.join(' ')).not.toMatch(/START|STOP|RESET/);
    // Nor any way to change how long the round is.
    expect(sheet()!.querySelector('[aria-label="Fewer minutes"]')).toBeNull();
  });

  it('says time is up on its own clock, without waiting to be told', async () => {
    // The host publishes once at START and not again until the phase changes,
    // so the document still says 'running' when the deadline passes.
    answer = shared(undefined, false, timing(1, -1000));
    await open();
    await act(async () => {
      clocks()[0].click();
    });

    expect(sheet()?.textContent).toContain('TIME');
  });

  it('puts the time left beside the clock, without the sheet being opened', async () => {
    // The point of the whole thing: somebody two courts away glances at the
    // page and knows how long is left, with nothing to tap first.
    answer = shared(undefined, false, timing(2, 305_000));
    await open();

    expect(clocks()[0].textContent?.trim()).toBe('5:05');
    // Icon first, digits second, the same way round as the host's card.
    expect(clocks()[0].firstElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  /**
   * The three things a watcher decides for their own phone.
   *
   * There is still nothing here that changes the session: the round is as long
   * as the host said, starts when they start it and ends when they end it. What
   * this adds is the part that was never the host's to decide — whether the
   * phone in somebody else's hand makes a noise about it.
   */
  describe('the alerts a watcher sets for their own phone', () => {
    async function openTimer(over: Partial<SharedRoundTimer> = {}) {
      answer = shared(undefined, false, { ...timing(1, 60_000), ...over });
      await open();
      await act(async () => {
        clocks()[0].click();
      });
    }

    /** A switch on the sheet, by the words beside it. */
    function toggle(label: string): HTMLButtonElement {
      const found = sheet()!.querySelector(`[aria-label="${label}"]`);
      if (!found) throw new Error(`no switch labelled ${label}`);
      return found as HTMLButtonElement;
    }

    it('offers Play Sound, Flash Screen and a tone', async () => {
      await openTimer();

      const said = sheet()!.textContent ?? '';
      expect(said).toContain('Play Sound');
      expect(said).toContain('Flash Screen');
      // Whose phone this is, said out loud. Without it these read as controls
      // over the session, and a player quietly silencing a court full of people
      // is the one thing this must never look like.
      expect(said).toContain('On this phone');
    });

    it('still offers nothing that changes the session itself', async () => {
      await openTimer();

      const words = [...sheet()!.querySelectorAll('button')].map((b) => b.textContent?.trim());
      expect(words.join(' ')).not.toMatch(/START|STOP|RESET/);
      expect(sheet()!.querySelector('[aria-label="Fewer minutes"]')).toBeNull();
    });

    it('starts on whatever the host chose', async () => {
      await openTimer({ soundOn: false, flashOn: true, alarmTone: 'police-whistle' });

      expect(toggle('Play Sound').getAttribute('aria-checked')).toBe('false');
      expect(toggle('Flash Screen').getAttribute('aria-checked')).toBe('true');
      expect(sheet()!.textContent).toContain('Police Whistle');
    });

    it('takes a watcher’s answer over the host’s, and remembers it', async () => {
      await openTimer({ soundOn: true });
      await act(async () => {
        toggle('Play Sound').click();
      });

      expect(toggle('Play Sound').getAttribute('aria-checked')).toBe('false');
      // Written down, because it is for the rest of the afternoon rather than
      // until the next poll lands the host's choice on top of it again.
      expect(window.localStorage.getItem('pb-watch-alerts')).toContain('sess-1');
    });

    it('leaves the switches they did not touch following the host', async () => {
      await openTimer({ soundOn: true, flashOn: true });
      await act(async () => {
        toggle('Play Sound').click();
      });

      expect(toggle('Flash Screen').getAttribute('aria-checked')).toBe('true');
    });
  });

  /**
   * A watcher's page used to be silent at the end of a round, whatever the host
   * had set. It counted down, it said TIME'S UP, and it made no noise: the
   * publisher never sent the sound setting or the tone, and nothing on this side
   * asked the alarm layer for anything.
   *
   * Whether it can be heard is still iOS's decision — an AudioContext will not
   * sound until a real gesture has unlocked it — but that is a phone's answer
   * to a request that is now actually made.
   */
  describe('the alarm on a watching phone', () => {
    it('sounds the host’s tone when the round runs out', async () => {
      answer = shared(undefined, false, {
        ...timing(1, -1000),
        soundOn: true,
        alarmTone: 'police-whistle'
      });
      await open();

      expect(alarms).toContain('start:police-whistle');
    });

    it('sounds it without the sheet ever having been opened', async () => {
      // The case it is most for. Somebody put their phone in a pocket at the
      // start of the round, which is not a request to be excused from the end
      // of it, and the sheet is not mounted when it comes.
      answer = shared(undefined, false, { ...timing(1, -1000), soundOn: true });
      await open();

      expect(sheet()).toBeNull();
      expect(alarms.some((a) => a.startsWith('start:'))).toBe(true);
    });

    it('stays quiet while the round is still running', async () => {
      answer = shared(undefined, false, { ...timing(1, 60_000), soundOn: true });
      await open();

      expect(alarms.some((a) => a.startsWith('start:'))).toBe(false);
    });

    it('stays quiet when the host asked for no sound', async () => {
      answer = shared(undefined, false, { ...timing(1, -1000), soundOn: false });
      await open();

      expect(alarms.some((a) => a.startsWith('start:'))).toBe(false);
    });

    it('is silenced the moment this watcher turns the sound off mid-ring', async () => {
      answer = shared(undefined, false, { ...timing(1, -1000), soundOn: true });
      await open();
      await act(async () => {
        clocks()[0].click();
      });
      alarms = [];

      const off = sheet()!.querySelector('[aria-label="Play Sound"]') as HTMLButtonElement;
      await act(async () => off.click());

      // The moment somebody most wants that switch is while it is going off in
      // their hand, so it has to take effect there and then.
      expect(alarms).toContain('stop');
      expect(alarms.some((a) => a.startsWith('start:'))).toBe(false);
    });
  });
});

// -------------------------------------------------------- the format on top --

describe('the format tab', () => {
  /** The published session with one round given a format. */
  function formatted(roundType: unknown): LiveFetch {
    const got = shared();
    if (got.state !== 'ok') throw new Error('unreachable');
    (got.snapshot.schedule.rounds[1] as { roundType?: unknown }).roundType = roundType;
    return got;
  }

  it('marks a special round the same way the host card does', async () => {
    answer = formatted('mixed');
    await open();

    expect(text()).toContain('Mixed Round');
  });

  it('draws no tab for a format this app has never heard of', async () => {
    // Straight off a network, so it may say anything. Everything that reads a
    // round's type uses it to look up a name and a colour, and an unknown word
    // reaching that lookup takes the whole page down rather than drawing
    // nothing.
    answer = formatted('quidditch');
    await open();

    expect(text()).toContain('Round 2');
    expect(text()).not.toContain('quidditch');
  });
});
