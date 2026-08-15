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
import type { Player, Schedule } from '../../types';

let answer: LiveFetch = { state: 'gone' };
let asks = 0;

vi.mock('../../lib/liveViewer', () => ({
  fetchShared: (key: string) => {
    asks += 1;
    void key;
    return Promise.resolve(answer);
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
function shared(score?: { team1: number; team2: number }): LiveFetch {
  return {
    state: 'ok',
    snapshot: withholdPrivate(
      sessionSnapshot({
        sessionId: 'sess-1',
        schedule: schedule(score),
        completedRounds: [1],
        players,
        scoringEnabled: true
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
  answer = { state: 'gone' };
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
    const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent);
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
    expect(text()).toMatch(/Updated \d/);
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

    answer = shared({ team1: 11, team2: 7 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
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
