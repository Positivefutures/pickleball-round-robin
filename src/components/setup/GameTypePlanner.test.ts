/**
 * @vitest-environment happy-dom
 *
 * The accessibility contract of the Set Game Types list.
 *
 * The old panel chose up and down arrows over a drag on purpose, and a drag
 * handle appearing does not make that reasoning go away: the host is on a phone
 * at the side of a court, and some of them are not dragging anything. So the
 * keyboard path is a real path, not a fallback, and this file is what holds it.
 *
 * It is also the only path a test can drive. happy-dom has no layout, so a
 * pointer drag here would prove nothing but the mock — which is why
 * `useListReorder` has no test of its own and the drag is checked in a real
 * browser instead.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RoundPlan } from '../../types';
import { emptyPlan, setPlanType } from '../../lib/roundPlan';
import { GameTypePlanner } from './GameTypePlanner';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;

interface Options {
  numRounds?: number;
  plan?: RoundPlan;
  lockedRounds?: number[];
  onCommit?: (next: RoundPlan) => void;
}

function mount({
  numRounds = 4,
  plan = emptyPlan(),
  lockedRounds = [],
  onCommit = () => {},
}: Options = {}): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      createElement(GameTypePlanner, { numRounds, plan, lockedRounds, onCommit }) as ReactElement
    )
  );
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function text(el: Element | null): string {
  return (el?.textContent ?? '').trim();
}

function handle(n: number): HTMLButtonElement | null {
  return container.querySelector(`[aria-label="Move Round ${n}"]`);
}

function rows(): HTMLElement[] {
  return [...container.querySelectorAll('h4')].map((h) => h.parentElement as HTMLElement);
}

/** The pill on a row, whether it is a button or a locked span. */
function pill(n: number): Element {
  const row = rows().find((r) => text(r.querySelector('h4')) === `Round ${n}`);
  if (!row) throw new Error(`no row for Round ${n}`);
  return row.lastElementChild!;
}

function press(el: Element, key: string) {
  act(() => {
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

/** Lets the focus move that follows a keyboard reorder land. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

describe('the grab handle', () => {
  it('is a real button, labelled with the round it moves', () => {
    mount();
    const grip = handle(2);
    expect(grip).not.toBeNull();
    expect(grip!.tagName).toBe('BUTTON');
    expect(grip!.getAttribute('type')).toBe('button');
  });

  it('says what the arrow keys do, for anybody who cannot see it to grab it', () => {
    mount();
    const described = handle(1)!.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(text(container.querySelector(`#${described}`)))
      .toBe('Press the up and down arrow keys to move this round.');
  });

  it('is not there at all on a round already played', () => {
    mount({ lockedRounds: [1] });
    expect(handle(1)).toBeNull();
    expect(handle(2)).not.toBeNull();
  });

  it('leaves a locked round no pill to press either', () => {
    mount({ lockedRounds: [1] });
    expect(pill(1).tagName).toBe('SPAN');
    expect(pill(2).tagName).toBe('BUTTON');
  });
});

describe('moving a round by keyboard', () => {
  const withMixed = () => setPlanType(emptyPlan(), 2, 'mixed');

  it('moves the type up, and leaves the round numbers where they are', () => {
    mount({ plan: withMixed() });
    press(handle(2)!, 'ArrowUp');

    expect(rows().map((r) => text(r.querySelector('h4')))).toEqual([
      'Round 1', 'Round 2', 'Round 3', 'Round 4',
    ]);
    expect(text(pill(1))).toBe('Mixed');
    expect(text(pill(2))).toBe('Normal');
  });

  it('moves the type down', () => {
    mount({ plan: withMixed() });
    press(handle(2)!, 'ArrowDown');
    expect(text(pill(3))).toBe('Mixed');
    expect(text(pill(2))).toBe('Normal');
  });

  it('does nothing at either end of the list', () => {
    mount({ plan: setPlanType(emptyPlan(), 1, 'skill') });
    press(handle(1)!, 'ArrowUp');
    expect(text(pill(1))).toBe('Equal Skill');
  });

  it('ignores every other key', () => {
    mount({ plan: withMixed() });
    press(handle(2)!, 'Enter');
    expect(text(pill(2))).toBe('Mixed');
  });

  it('announces what moved and where it went', () => {
    mount({ plan: withMixed() });
    press(handle(2)!, 'ArrowUp');
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(text(live)).toBe('Mixed moved to Round 1.');
  });

  /**
   * React keeps the same DOM node at the same index, so without the focus move
   * the host is left holding the row they have just moved away from — and the
   * next arrow press moves the wrong thing.
   */
  it('takes the focus with what moved, not with the slot it left', async () => {
    mount({ plan: withMixed() });
    handle(2)!.focus();
    press(handle(2)!, 'ArrowUp');
    await settle();
    expect(document.activeElement).toBe(handle(1));
  });

  it('steps over a round already played rather than through it', () => {
    // Round 2 is played. Moving round 3's type up must land it on round 1 and
    // leave round 2 exactly as it was played.
    const plan = setPlanType(setPlanType(emptyPlan(), 2, 'gendered'), 3, 'mixed');
    mount({ plan, lockedRounds: [2] });

    press(handle(3)!, 'ArrowUp');
    expect(text(pill(1))).toBe('Mixed');
    expect(text(pill(2))).toBe('Gendered');
    expect(text(pill(3))).toBe('Normal');
  });
});

describe('the picker', () => {
  function open(n: number) {
    act(() => (pill(n) as HTMLElement).click());
    const dialog = container.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('the picker did not open');
    return dialog;
  }

  it('is a modal dialog naming the round it is setting', () => {
    mount();
    const dialog = open(3);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Game type for Round 3');
  });

  it('offers the four, and no fifth thing to set', () => {
    mount();
    const dialog = open(1);
    const options = [...dialog.querySelectorAll('button')].map((b) => text(b));
    expect(options).toEqual([
      'Normal Round', 'Gendered Round', 'Mixed Round', 'Equal Skill Round', 'Cancel',
    ]);
    // No frequency in here. One round, one answer.
    expect(dialog.querySelector('select')).toBeNull();
    expect(text(dialog)).not.toContain('Every');
  });

  it('marks the one in force', () => {
    mount({ plan: setPlanType(emptyPlan(), 1, 'skill') });
    const dialog = open(1);
    const current = [...dialog.querySelectorAll('[aria-current="true"]')];
    expect(current).toHaveLength(1);
    expect(text(current[0])).toBe('Equal Skill Round');
  });

  it('sets the round and closes on a pick', () => {
    mount();
    const dialog = open(2);
    const mixed = [...dialog.querySelectorAll('button')].find((b) => text(b) === 'Mixed Round')!;
    act(() => mixed.click());

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(text(pill(2))).toBe('Mixed');
  });

  it('changes nothing on Cancel', () => {
    mount({ plan: setPlanType(emptyPlan(), 2, 'gendered') });
    const dialog = open(2);
    const cancel = [...dialog.querySelectorAll('button')].find((b) => text(b) === 'Cancel')!;
    act(() => cancel.click());

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(text(pill(2))).toBe('Gendered');
  });
});

describe('Done', () => {
  it('hands back the whole plan, once, and not before', () => {
    const commits: RoundPlan[] = [];
    mount({ onCommit: (next) => commits.push(next) });

    const dialog = (() => {
      act(() => (pill(2) as HTMLElement).click());
      return container.querySelector('[role="dialog"]')!;
    })();
    const mixed = [...dialog.querySelectorAll('button')].find((b) => text(b) === 'Mixed Round')!;
    act(() => mixed.click());

    // Nothing has left this component yet. The tab must not blink while the
    // host is still choosing — see App.tsx's handlePlanCommit.
    expect(commits).toHaveLength(0);

    const done = [...container.querySelectorAll('button')].find((b) => text(b) === 'Done')!;
    act(() => done.click());
    expect(commits).toHaveLength(1);
    expect(commits[0][1]).toBe('mixed');
  });
});

describe('the rows drawn', () => {
  it('is one per round, however many the session has', () => {
    mount({ numRounds: 16 });
    expect(rows()).toHaveLength(16);
    expect(text(rows()[15].querySelector('h4'))).toBe('Round 16');
  });

  /**
   * The plan is sixteen slots whatever the session's length, so a session of
   * four shows four rows and keeps the rest. Shortening the afternoon must not
   * throw the tail away.
   */
  it('shows only the rounds the session has, and keeps the rest', () => {
    const commits: RoundPlan[] = [];
    mount({
      numRounds: 4,
      plan: setPlanType(emptyPlan(), 10, 'skill'),
      onCommit: (next) => commits.push(next),
    });

    expect(rows()).toHaveLength(4);
    const done = [...container.querySelectorAll('button')].find((b) => text(b) === 'Done')!;
    act(() => done.click());
    expect(commits[0][9]).toBe('skill');
  });
});
