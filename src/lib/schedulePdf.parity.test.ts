/**
 * @vitest-environment happy-dom
 *
 * The two printouts have to say the same thing.
 *
 * There are now two renderers for one document: `PrintSchedule`, which the
 * browser prints, and `schedulePdf`, which the share sheet sends. Someone who
 * prints from a laptop and someone who shares from a phone are looking at the
 * same session, and a difference between the sheets would be found at a court
 * rather than here.
 *
 * The comparison is deliberately blind to layout. It reads both renderings with
 * every space removed, so wrapping a long pair over two lines, or putting the
 * "(normal game)" note under its court instead of beside it, is allowed. What
 * it can see is content and order: a dropped name, a missing sit-out line, a
 * court in the wrong place, a badge on the wrong round.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Player, Schedule } from '../types';
import { PrintSchedule } from '../components/print/PrintSchedule';
import { layoutSchedule, PDF_TITLE } from './schedulePdf';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NAMES = [
  'Ava', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana',
  'Ivy', 'Jo', 'Bartholomew', 'Maximilian', 'O’Brien', 'José',
];

const players: Player[] = NAMES.map((name, i) => ({
  id: `p${i}`,
  name,
  rating: 3.5,
  gender: i % 2 === 0 ? 'M' : 'F',
  rosterIds: ['g1'],
}));

function court(n: number, a: number[], b: number[]) {
  return {
    courtNumber: n,
    team1: a.map((i) => players[i]),
    team2: b.map((i) => players[i]),
    ratingDiff: 0,
  };
}

/** Ordinary, mixed with an odd court out, and gendered, plus a long pair. */
const schedule: Schedule = {
  rounds: [
    { roundNumber: 1, courts: [court(1, [0, 1], [2, 3]), court(2, [4, 5], [6, 7])], sitOuts: [players[8], players[9]] },
    // Court 3 is four men in a mixed round, so it takes the "(normal game)"
    // note and the other two do not.
    { roundNumber: 2, roundType: 'mixed', courts: [court(1, [0, 3], [2, 1]), court(2, [10, 11], [12, 13]), court(3, [0, 2], [4, 6])], sitOuts: [] },
    { roundNumber: 3, roundType: 'gendered', courts: [court(1, [0, 6], [4, 2])], sitOuts: [players[13]] },
  ],
};

let root: Root;
let container: HTMLElement;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * What the browser would print, as one run of characters.
 *
 * The sheet only, not the page furniture around it. The address in the footer
 * is one element that the browser repeats on every page, while the PDF has to
 * draw its own copy on each, so counting it here would compare a one against
 * an N. `PDF_FOOTER` is checked separately, in schedulePdf.test.ts.
 */
function printed(): string {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(PrintSchedule, { schedule, players }));
  });
  const sheet = container.querySelector('.print-sheet');
  if (!sheet) throw new Error('no .print-sheet rendered');
  return (sheet.textContent ?? '').replace(/\s+/g, '');
}

/** What the PDF would say, in the order it draws it. */
function shared(): string {
  return layoutSchedule(schedule, players)
    .flat()
    .flatMap((op) => (op.kind === 'text' ? [op.text] : []))
    .join('')
    .replace(/\s+/g, '');
}

describe('the printed sheet and the shared PDF', () => {
  it('say the same thing in the same order', () => {
    expect(shared()).toBe(printed());
  });

  it('are actually saying something, so an empty match cannot pass', () => {
    // Without this the test above would go green if both renderers broke.
    const text = printed();
    expect(text.length).toBeGreaterThan(200);
    expect(text).toContain(PDF_TITLE.replace(/\s+/g, ''));
    expect(text).toContain('O’Brien');
    expect(text).toContain('Sittingout:');
    expect(text).toContain('(normalgame)');
    expect(text).toContain('(MixedRound)');
    expect(text).toContain('ROUND1');
    expect(text).toContain('COURT1');
  });
});
