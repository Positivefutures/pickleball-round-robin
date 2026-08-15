/**
 * @vitest-environment happy-dom
 *
 * The standings table.
 *
 * The ranking itself is proved in lib/standings.test.ts. What is checked here is
 * that the panel puts it on screen in that order, under the columns it promises,
 * and that a differential reads as the signed number it is.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CourtAssignment, CourtScore, Player, Round, Schedule } from '../../types';
import { StandingsPanel } from './StandingsPanel';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function player(name: string, guest?: true): Player {
  const p: Player = { id: `id-${name}`, name, rating: 4, gender: 'M', rosterIds: ['g1'] };
  if (guest) p.guest = guest;
  return p;
}

function court(t1: string[], t2: string[], score?: CourtScore): CourtAssignment {
  const c: CourtAssignment = {
    courtNumber: 1,
    team1: t1.map((n) => player(n)),
    team2: t2.map((n) => player(n)),
    ratingDiff: 0,
  };
  if (score) c.score = score;
  return c;
}

const round = (n: number, courts: CourtAssignment[]): Round => ({
  roundNumber: n,
  courts,
  sitOuts: [],
});

let root: Root;
let container: HTMLElement;

function render(schedule: Schedule, players: Player[], readOnly = false): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(StandingsPanel, { schedule, players, readOnly }));
  });
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** The body rows, each as the run of cell texts. */
function rows(el: HTMLElement): string[][] {
  return [...el.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '')
  );
}

const headers = (el: HTMLElement) =>
  [...el.querySelectorAll('thead th')].map((th) => th.textContent);

/**
 * Cara wins both, Dan and Ava win one each, Ben wins none — an order that runs
 * against the alphabet on purpose, so a table that quietly sorted by name would
 * fail rather than pass by luck.
 *
 * Cara +6 / 22 pts, Dan +2 / 20, Ava −2 / 18, Ben −6 / 16.
 */
const scored: Schedule = {
  rounds: [
    round(1, [court(['Cara', 'Dan'], ['Ava', 'Ben'], { team1: 11, team2: 7 })]),
    round(2, [court(['Cara', 'Ava'], ['Dan', 'Ben'], { team1: 11, team2: 9 })]),
  ],
};
const four = ['Ava', 'Ben', 'Cara', 'Dan'].map((n) => player(n));

describe('before anything has been scored', () => {
  it('says so, and says where to start', () => {
    const el = render({ rounds: [round(1, [court(['Ava', 'Ben'], ['Cara', 'Dan'])])] }, four);
    expect(el.textContent).toContain('No scores yet');
    expect(el.querySelector('table')).toBeNull();
  });

  it('does not send somebody watching to a scoreboard they cannot tap', () => {
    const el = render(
      { rounds: [round(1, [court(['Ava', 'Ben'], ['Cara', 'Dan'])])] },
      four,
      true
    );
    expect(el.textContent).toContain('No scores have been entered yet.');
    expect(el.textContent).not.toContain('Tap the scoreboard');
  });
});

describe('once there are scores', () => {
  it('names its columns', () => {
    expect(headers(render(scored, four))).toEqual(['Player', 'W', 'L', 'Diff', 'Pts']);
  });

  it('puts one row up per player', () => {
    expect(rows(render(scored, four))).toHaveLength(4);
  });

  it('lists them in rank order rather than by name', () => {
    const names = rows(render(scored, four)).map((r) => r[0]);
    expect(names).toEqual(['Cara', 'Dan', 'Ava', 'Ben']);
  });

  it('gives each row its wins, losses, difference and points', () => {
    const top = rows(render(scored, four))[0];
    expect(top).toEqual(['Cara', '2', '0', '+6', '22']);
  });

  it('signs a positive difference, and leaves a negative one its own sign', () => {
    const all = rows(render(scored, four));
    const diffs = all.map((r) => r[3]);
    expect(diffs).toContain('+6');
    // One minus sign, not two, and no plus in front of it.
    expect(diffs.some((d) => /^-\d+$/.test(d))).toBe(true);
    expect(diffs.every((d) => !d.startsWith('+-'))).toBe(true);
  });

  /**
   * A guest used to wear a badge here. It has gone at the host's request: a
   * guest is somebody playing this afternoon like everybody else, and the
   * standings are a list of who won what.
   */
  it('gives a guest a row like anybody else, and no badge on it', () => {
    const guest = player('Sam', true);
    const el = render(
      { rounds: [round(1, [court(['Sam', 'Ben'], ['Cara', 'Dan'], { team1: 11, team2: 7 })])] },
      [...four, guest]
    );
    const sam = [...el.querySelectorAll('tbody tr')].find((tr) =>
      tr.textContent?.startsWith('Sam')
    );
    expect(sam).toBeDefined();
    expect(sam!.textContent).not.toContain('Guest');
  });

  it('keeps somebody who sat out all afternoon on the table', () => {
    // A name missing from the standings reads as a fault, not as a zero.
    const el = render(scored, [...four, player('Zoe')]);
    const names = rows(el).map((r) => r[0]);
    expect(names).toContain('Zoe');
    expect(rows(el).find((r) => r[0] === 'Zoe')).toEqual(['Zoe', '0', '0', '0', '0']);
  });
});

describe('sorting by a column', () => {
  /** Clicks a heading by its label. */
  function tapHeader(el: HTMLElement, label: string) {
    const th = [...el.querySelectorAll('thead th')].find(
      (h) => (h.textContent ?? '').trim() === label
    );
    if (!th) throw new Error(`no ${label} heading`);
    act(() => {
      th.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  const names = (el: HTMLElement) => rows(el).map((r) => r[0]);

  /** The heading cell, so its state can be read back. */
  const header = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll('thead th')].find(
      (h) => (h.textContent ?? '').trim() === label
    ) as HTMLElement;

  it('starts on the ranking, with nothing marked as sorted', () => {
    const el = render(scored, four);
    expect(names(el)).toEqual(['Cara', 'Dan', 'Ava', 'Ben']);
    const sorted = [...el.querySelectorAll('thead th')].map((h) => h.getAttribute('aria-sort'));
    expect(sorted).toEqual(['none', 'none', 'none', 'none', 'none']);
  });

  it('goes highest first on the first tap', () => {
    // Losses run the other way to the ranking, so this cannot pass by accident.
    const el = render(scored, four);
    tapHeader(el, 'L');
    expect(rows(el).map((r) => r[2])).toEqual(['2', '1', '1', '0']);
    expect(header(el, 'L').getAttribute('aria-sort')).toBe('descending');
  });

  it('turns round on the second tap', () => {
    const el = render(scored, four);
    tapHeader(el, 'L');
    tapHeader(el, 'L');
    expect(rows(el).map((r) => r[2])).toEqual(['0', '1', '1', '2']);
    expect(header(el, 'L').getAttribute('aria-sort')).toBe('ascending');
  });

  it('puts the ranking back on the third', () => {
    const el = render(scored, four);
    tapHeader(el, 'L');
    tapHeader(el, 'L');
    tapHeader(el, 'L');
    expect(names(el)).toEqual(['Cara', 'Dan', 'Ava', 'Ben']);
    expect(header(el, 'L').getAttribute('aria-sort')).toBe('none');
  });

  it('starts a different column afresh at highest first', () => {
    // Two taps on one heading then one on another must not land on ascending.
    const el = render(scored, four);
    tapHeader(el, 'L');
    tapHeader(el, 'L');
    tapHeader(el, 'Pts');
    expect(rows(el).map((r) => r[4])).toEqual(['22', '20', '18', '16']);
    expect(header(el, 'L').getAttribute('aria-sort')).toBe('none');
    expect(header(el, 'Pts').getAttribute('aria-sort')).toBe('descending');
  });

  it('holds the ranking order between players a column cannot separate', () => {
    // Dan and Ava both lost one. The ranking put Dan above Ava, and sorting by
    // a column they tie on must not shuffle them.
    const el = render(scored, four);
    tapHeader(el, 'L');
    expect(names(el).slice(1, 3)).toEqual(['Dan', 'Ava']);
  });

  it('sorts names as text, largest first like every other column', () => {
    const el = render(scored, four);
    tapHeader(el, 'Player');
    expect(names(el)).toEqual(['Dan', 'Cara', 'Ben', 'Ava']);
  });

  it('marks only the column being sorted', () => {
    const el = render(scored, four);
    tapHeader(el, 'Diff');
    const marked = [...el.querySelectorAll('thead th')].filter(
      (h) => h.querySelector('button')!.className.includes('bg-brand-teal-light')
    );
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toBe('Diff');
  });

  it('stands the ranking note down while a column is sorted', () => {
    const el = render(scored, four);
    expect(el.textContent).toContain('Ranked by wins');
    tapHeader(el, 'W');
    expect(el.textContent).not.toContain('Ranked by wins');
    expect(el.textContent).toContain('Tap W once more');
  });
});
