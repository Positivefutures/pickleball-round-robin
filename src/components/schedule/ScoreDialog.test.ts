/**
 * @vitest-environment happy-dom
 *
 * Writing down a game.
 *
 * The keypad's own arithmetic is exercised through the walkthrough; what is
 * held here is the quieter promise Jeff asked for on 2026-08-17 — that a
 * half-filled panel says nothing at all. The greyed Save is the whole message.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CourtAssignment, Player } from '../../types';
import { ScoreDialog } from './ScoreDialog';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const player = (name: string): Player => ({
  id: `id-${name}`,
  name,
  rating: 4,
  gender: 'M',
  rosterIds: ['g1'],
});

const court: CourtAssignment = {
  courtNumber: 1,
  team1: [player('Ann'), player('Ben')],
  team2: [player('Cal'), player('Dee')],
  ratingDiff: 0,
};

let root: Root;
let container: HTMLElement;

function open() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(ScoreDialog, { court, onDone: () => {}, onCancel: () => {} })
    );
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** A keypad face, by the digit or word on it. */
const key = (face: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === face)!;

const save = () =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === 'Save') as
    | HTMLButtonElement
    | undefined;

describe('the panel a score is typed into', () => {
  it('never tells the host off for being halfway through', () => {
    // One number in is the ordinary state of this panel: the second is on its
    // way. It used to answer that with "Both sides need a number." in amber,
    // which was the app's only line of nagging.
    open();
    expect(container.textContent).not.toContain('Both sides need a number');

    act(() => key('11').click());
    expect(container.textContent).not.toContain('Both sides need a number');
    expect(container.textContent).not.toContain('need a number');

    act(() => key('7').click());
    expect(container.textContent).not.toContain('need a number');
  });

  it('says it with the Save button instead, which is the part that acts', () => {
    // The line is gone, so this is the only thing left saying a half score
    // cannot be saved. If it ever stopped being disabled the panel would have
    // no way at all of telling anybody.
    open();
    act(() => key('11').click());
    expect(save()!.disabled).toBe(true);

    act(() => key('7').click());
    expect(save()!.disabled).toBe(false);
  });
});
