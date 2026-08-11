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

function render(schedule: Schedule, players: Player[]): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(StandingsPanel, { schedule, players }));
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

  it('marks a guest, so two people of one name do not read alike', () => {
    const guest = player('Sam', true);
    const el = render(
      { rounds: [round(1, [court(['Sam', 'Ben'], ['Cara', 'Dan'], { team1: 11, team2: 7 })])] },
      [...four, guest]
    );
    const sam = [...el.querySelectorAll('tbody tr')].find((tr) =>
      tr.textContent?.startsWith('Sam')
    );
    expect(sam!.textContent).toContain('Guest');
  });

  it('keeps somebody who sat out all afternoon on the table', () => {
    // A name missing from the standings reads as a fault, not as a zero.
    const el = render(scored, [...four, player('Zoe')]);
    const names = rows(el).map((r) => r[0]);
    expect(names).toContain('Zoe');
    expect(rows(el).find((r) => r[0] === 'Zoe')).toEqual(['Zoe', '0', '0', '0', '0']);
  });
});
