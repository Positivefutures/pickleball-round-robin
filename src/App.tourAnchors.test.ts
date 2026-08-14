/**
 * @vitest-environment happy-dom
 *
 * The `data-tutorial` attributes the first-run tour hangs its spotlight on.
 *
 * They are inert — nothing in the app reads them, so nothing in the app breaks
 * if one is dropped. The tour just quietly stops pointing at anything, on a
 * screen only brand new users ever see. That is exactly the kind of fault that
 * ships, which is why the anchors get their own suite rather than being left to
 * the tour's own tests.
 *
 * Three of them are placed to survive something that moves, and those three are
 * what most of this file is about: a completed round floats to the top of the
 * list, a completed court loses the button inside its heading, and the Select
 * Players panel swaps its contents out for the pairing view.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { runMigrations } from './lib/migrations';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NAMES = ['Ava', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana', 'Ivy', 'Jo', 'Kit', 'Lex'];

/**
 * A group that is nobody's first install.
 *
 * pb-rosters is written before runMigrations, so the fresh-install branch never
 * fires, no exampleMeta is recorded, and the splash stays shut. What is being
 * tested here is the anchors, not the greeting.
 */
function seed(courts = 3) {
  window.localStorage.clear();
  const players = NAMES.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    rating: 3.5 + (i % 4) * 0.25,
    gender: i % 2 === 0 ? 'M' : 'F',
    rosterIds: ['g1'],
  }));
  window.localStorage.setItem('pb-rosters', JSON.stringify([{ id: 'g1', name: 'Test Group' }]));
  window.localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
  window.localStorage.setItem('pb-roster', JSON.stringify(players));
  window.localStorage.setItem('pb-selected-ids', JSON.stringify(players.map((p) => p.id)));
  window.localStorage.setItem('pb-num-courts', JSON.stringify(courts));
  window.localStorage.setItem('pb-num-rounds', JSON.stringify(4));
  runMigrations();
}

let root: Root;
let container: HTMLElement;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(App));
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const text = (el: Element) => (el.textContent ?? '').trim();

function anchor(name: string): HTMLElement | null {
  return container.querySelector(`[data-tutorial="${name}"]`);
}

function need(name: string): HTMLElement {
  const el = anchor(name);
  if (!el) throw new Error(`no [data-tutorial="${name}"] on screen`);
  return el;
}

function click(el: Element) {
  act(() => {
    (el as HTMLElement).click();
  });
}

function clickButton(re: RegExp, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll('button, [role="button"]')].find((b) => re.test(text(b)));
  if (!found) throw new Error(`no button matching ${re}`);
  click(found);
}

/** The round card whose heading reads "Round N". */
function roundCard(n: number): HTMLElement {
  const card = [...container.querySelectorAll('.round-card')].find(
    (c) => text(c.querySelector('h3') ?? c) === `Round ${n}`
  );
  if (!card) throw new Error(`no card for Round ${n}`);
  return card as HTMLElement;
}

function markComplete(n: number) {
  click(roundCard(n).querySelector('input[type="checkbox"]')!);
}

function generate() {
  clickButton(/^Continue to Setup/);
  clickButton(/^Generate Schedule/);
}

describe('the Players tab anchors', () => {
  it('names the group and the way out of the page', () => {
    seed();
    mount();
    expect(text(need('group-name'))).toContain('Test Group');
    expect(text(need('continue-setup'))).toContain('Continue to Setup');
  });
});

describe('the Setup tab anchors', () => {
  it('names the heading and the row holding both steppers', () => {
    seed();
    mount();
    clickButton(/^Continue to Setup/);

    expect(text(need('setup-title'))).toBe('Setup Round Robin');
    // The box the tour draws is the heading and these two together, so this
    // must hold the steppers and nothing else on the panel.
    const steppers = need('setup-steppers');
    expect(text(steppers)).toContain('Number of Courts');
    expect(text(steppers)).toContain('Number of Rounds');
    expect(text(steppers)).not.toContain('Select Players');
  });

  it('keeps the Select Players anchor when the panel turns into the pairing view', () => {
    // The anchor is on the panel, not on PlayerSelector inside it. Put it
    // inside and Set Partners takes the tour's box off the screen.
    seed();
    mount();
    clickButton(/^Continue to Setup/);
    expect(text(need('select-players'))).toContain('Select Players');

    clickButton(/^Set Partners/);
    expect(anchor('select-players')).not.toBeNull();
    expect(text(need('select-players'))).not.toContain('Select Players');
  });
});

describe('the Schedule tab anchors', () => {
  it('names the Actions button, the first round and its first two courts', () => {
    seed();
    mount();
    generate();

    expect(text(need('actions-button'))).toContain('Actions');
    expect(text(need('round-1').querySelector('h3')!)).toBe('Round 1');
    expect(text(need('round-1-completed'))).toContain('COMPLETED');
    expect(text(need('court-1-label'))).toBe('COURT 1');
    expect(text(need('court-1'))).toContain('COURT 1');
    expect(text(need('court-2'))).toContain('COURT 2');
  });

  it('marks one round and two courts, not every round and every court', () => {
    seed();
    mount();
    generate();

    expect(container.querySelectorAll('[data-tutorial="round-1"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-tutorial="court-1"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-tutorial="court-2"]')).toHaveLength(1);
    // Three courts were asked for, so a third exists and is deliberately
    // anonymous — the tour only ever boxes the first two.
    expect(roundCard(1).querySelectorAll('h4').length).toBeGreaterThanOrEqual(3);
  });

  it('stays on Round 1 after a later round is completed and floats to the top', () => {
    // Completed rounds are re-sorted to the head of the list, so an anchor
    // keyed on where the round is drawn would follow Round 2 up there.
    seed();
    mount();
    generate();
    markComplete(2);

    const cards = [...container.querySelectorAll('.round-card')];
    expect(text(cards[0].querySelector('h3')!)).toBe('Round 2');
    expect(text(need('round-1').querySelector('h3')!)).toBe('Round 1');
  });

  it('keeps the court heading anchor when the round is completed and the button goes', () => {
    // On a completed round COURT 1 degrades from a button to bare text. The
    // anchor is on the heading around it, which is there either way.
    seed();
    mount();
    generate();
    markComplete(1);
    // A completed round collapses, so open it again to see its courts at all.
    clickButton(/^View/, roundCard(1));

    expect(anchor('court-1-label')).not.toBeNull();
    expect(text(need('court-1-label'))).toBe('COURT 1');
    expect(need('court-1-label').querySelector('button')).toBeNull();
  });
});
