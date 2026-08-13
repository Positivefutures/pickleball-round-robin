// @vitest-environment happy-dom
/**
 * The guided tour, driven the way a person drives it: the real App mounted
 * headlessly, every step performed with real clicks and typing, the engine
 * advancing only because the state actually changed. Layout does not exist
 * under happy-dom, and nothing here needs it — that is a design constraint on
 * the tutorial itself (see lib/tutorial.ts).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { runMigrations } from './lib/migrations';
import { __tutorialTesting } from './lib/tutorial';
import type { Schedule } from './types';

declare global {
   
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  // A real reload empties the engine's module state; tests have to ask.
  __tutorialTesting.reset();
});

function remount(between?: () => void) {
  act(() => root.unmount());
  container.remove();
  __tutorialTesting.reset();
  between?.();
  mount();
}

/** A brand-new phone: nothing in storage but what the seed writes. */
function freshInstall() {
  window.localStorage.clear();
  runMigrations();
}

/** An updated install: a real group, and the splash not yet waved away. */
function existingUser(names = ['Ava', 'Ben', 'Cara', 'Dan']) {
  window.localStorage.clear();
  const players = names.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    rating: 3.5,
    gender: i % 2 === 0 ? 'M' : 'F',
    rosterIds: ['g1'],
  }));
  window.localStorage.setItem('pb-rosters', JSON.stringify([{ id: 'g1', name: 'Test Group' }]));
  window.localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
  window.localStorage.setItem('pb-roster', JSON.stringify(players));
  runMigrations();
}

function text(el: Element): string {
  return (el.textContent ?? '').trim();
}

function buttons(re: RegExp, scope: ParentNode = container): HTMLElement[] {
  return [...scope.querySelectorAll('button, [role="button"]')].filter((b) =>
    re.test(text(b))
  ) as HTMLElement[];
}

function click(el: Element) {
  act(() => {
    (el as HTMLElement).click();
  });
}

function clickButton(re: RegExp, scope: ParentNode = container) {
  const found = buttons(re, scope);
  if (found.length === 0) {
    throw new Error(
      `no button matching ${re}; saw: ${[...scope.querySelectorAll('button')]
        .map((b) => JSON.stringify(text(b).slice(0, 30)))
        .join(', ')}`
    );
  }
  click(found[0]);
}

function clickLabel(label: string, scope: ParentNode = container) {
  const el = scope.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no control labelled ${label}`);
  click(el);
}

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function nameInput(scope: ParentNode = container): HTMLInputElement {
  const input = scope.querySelector('input[data-tutorial="player-name-input"]');
  if (!input) throw new Error('no player name input on screen');
  return input as HTMLInputElement;
}

function sheet(): HTMLElement {
  const dialogs = [...container.querySelectorAll('[role="dialog"]')].filter(
    (d) => d.getAttribute('aria-label') !== 'Tutorial'
  );
  if (dialogs.length === 0) throw new Error('the Actions sheet is not open');
  return dialogs[0] as HTMLElement;
}

function action(label: RegExp) {
  clickButton(/^Actions$/);
  clickButton(label, sheet());
}

function roundCard(n: number): HTMLElement {
  const card = [...container.querySelectorAll('.round-card')].find(
    (c) => text(c.querySelector('h3') ?? c) === `Round ${n}`
  );
  if (!card) throw new Error(`no card for Round ${n}`);
  return card as HTMLElement;
}

function storedSchedule(): Schedule {
  return JSON.parse(window.localStorage.getItem('pb-schedule') ?? 'null');
}

function stored<T>(key: string): T {
  return JSON.parse(window.localStorage.getItem(key) ?? 'null');
}

function atStep(n: number) {
  expect(container.textContent).toContain(`Step ${n} of 13`);
}

const overlayGone = () => expect(container.textContent).not.toContain('of 13');

/**
 * Lets the engine's deferred work catch up. Stage changes that come from the
 * DOM alone (a dialog opening, pairing mode closing) land a microtask after
 * the click, and the typing latch lands a 0ms task later; store-driven
 * advances are synchronous and never need this.
 */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** Splash → Start Tutorial. */
function startFromSplash() {
  expect(container.textContent).toContain('Skip Tutorial');
  clickButton(/^Start Tutorial$/);
}

/** Steps 1–2: add somebody, continue to Setup. */
function addPlayerAndContinue() {
  atStep(1);
  typeInto(nameInput(), 'Pat Q.');
  clickButton(/^Add Player$/);
  atStep(2);
  clickButton(/^Continue to Setup/);
  atStep(3);
}

describe('the tutorial, first run on a fresh install', () => {
  it('walks start to finish in the example group, every action performed for real', async () => {
    freshInstall();
    mount();
    startFromSplash();

    // 1 — the arrow points at the name box until typing starts. The engine
    // lowers it a microtask later, deliberately (see noteTutorialTyping).
    atStep(1);
    expect(container.querySelector('.tutorial-arrow')).not.toBeNull();
    typeInto(nameInput(), 'Pat Q.');
    await settle();
    expect(container.querySelector('.tutorial-arrow')).toBeNull();
    expect(nameInput().value).toBe('Pat Q.');
    clickButton(/^Add Player$/);

    // 2 — the real Continue button, not a Next.
    atStep(2);
    clickButton(/^Continue to Setup/);

    // 3 — informational; Next advances.
    atStep(3);
    expect(container.textContent).toContain('Courts and rounds');
    clickButton(/^Next$/);

    // 4 — Select All is over-achievement, and welcome.
    atStep(4);
    expect(container.textContent).toContain('You need at least 10');
    clickButton(/^Select All$/);

    // 5 — link a couple by the real two-tap flow.
    atStep(5);
    clickButton(/^Set Partners$/);
    const pairing = () => container.querySelector('[data-tutorial="partner-pairing"]')!;
    clickButton(/^Amy C/, pairing());
    clickButton(/^Ben T/, pairing());

    // 6 — pairing is still open, so the tour asks for Done Pairing first.
    atStep(6);
    expect(container.textContent).toContain('Tap Done Pairing first.');
    clickButton(/^Done Pairing$/);
    await settle();
    expect(container.textContent).toContain('Tap Generate Schedule.');
    clickButton(/^Generate Schedule/);

    // 7 — mark round 1 played.
    atStep(7);
    click(roundCard(1).querySelector('input[type="checkbox"]')!);

    // 8 — swap a court player with a sit-out in an open round.
    atStep(8);
    const before = storedSchedule();
    const open = before.rounds.find((r) => r.roundNumber === 2)!;
    const onCourt = open.courts[0].team1[0].name;
    const sittingOut = open.sitOuts[0].name;
    clickButton(new RegExp(`^${onCourt}`), roundCard(2));
    clickButton(new RegExp(`^${sittingOut}`), roundCard(2));
    expect(storedSchedule()).not.toEqual(before);

    // 9 — a latecomer, through the Actions sheet.
    atStep(9);
    action(/^Add a Player$/);
    clickButton(/^Someone new$/, sheet());
    typeInto(nameInput(sheet()), 'Robin Y.');
    clickButton(/^Add to Group and Session$/, sheet());

    // 10 — somebody leaves: tap them, the pencil, remove, confirm.
    atStep(10);
    const leaving = storedSchedule().rounds.find((r) => r.roundNumber === 2)!.courts[0].team1[0]
      .name;
    clickButton(new RegExp(`^${leaving}`), roundCard(2));
    click(roundCard(2).querySelector(`[aria-label="Edit ${leaving}"]`)!);
    clickButton(/^Remove from Remaining Rounds$/);
    clickButton(/^Yes$/);

    // 11 — reshuffle weaves the changes in; the why arrives with the button.
    atStep(11);
    action(/^Reshuffle$/);
    await settle();
    expect(container.textContent).toContain('weaves your new player');
    clickButton(/^Rebuild \d+ Rounds?$/, sheet());

    // 12 — the wrap-up card.
    atStep(12);
    expect(container.textContent).toContain('That is the whole loop.');
    clickButton(/^Next$/);

    // 13 — guided out: new session, then Manage, then Finish at the field.
    atStep(13);
    action(/^Start New Session$/);
    clickButton(/^Yes, Start New$/, sheet());
    await settle();
    expect(container.textContent).toContain('Tap Manage.');
    clickButton(/^Manage$/);
    await settle();
    expect(container.textContent).toContain('type a name here to make your own group');
    clickButton(/^Finish$/);

    overlayGone();
    expect(stored<boolean>('pb-tutorial-completed')).toBe(true);
    expect(stored<unknown>('pb-tutorial-state')).toBeNull();
    // First run leaves its results behind: the added players stay.
    const names = stored<{ name: string }[]>('pb-roster').map((p) => p.name);
    expect(names).toContain('Pat Q.');
    expect(names).toContain('Robin Y.');
  });

  it('refuses Next while the courts outnumber the group, and says why', () => {
    freshInstall();
    mount();
    startFromSplash();
    addPlayerAndContinue();

    // 3 courts up to 7: minPlayersForCourts(7) = 26, and the group holds 25.
    for (let i = 0; i < 4; i++) clickLabel('More courts');
    clickButton(/^Next$/);
    atStep(3);
    expect(container.textContent).toContain('Lower the courts a little.');

    clickLabel('Fewer courts');
    clickButton(/^Next$/);
    atStep(4);
  });

  it('stops onto the Players tab, leaving the example group as it stands', () => {
    freshInstall();
    mount();
    startFromSplash();
    addPlayerAndContinue();

    clickButton(/^Stop tutorial$/);
    overlayGone();
    expect(stored<string>('pb-step')).toBe('roster');
    // The artifacts stay: this group exists to be experimented on.
    expect(stored<{ name: string }[]>('pb-roster')).toHaveLength(25);
    expect(stored<boolean | null>('pb-tutorial-completed')).not.toBe(true);
    expect(stored<unknown>('pb-tutorial-state')).toBeNull();
  });
});

describe('the tutorial, rerun by an existing user', () => {
  it('plays in a temporary group and cleans it away on stop', () => {
    existingUser();
    mount();
    startFromSplash();

    // The tour opened a Tutorial Group with its own 24 people.
    expect(stored<{ name: string }[]>('pb-rosters').map((r) => r.name)).toContain(
      'Tutorial Group'
    );
    expect(stored<{ name: string }[]>('pb-roster')).toHaveLength(4 + 24);
    atStep(1);

    clickButton(/^Stop tutorial$/);
    overlayGone();
    expect(stored<{ name: string }[]>('pb-rosters').map((r) => r.name)).toEqual(['Test Group']);
    expect(stored<{ name: string }[]>('pb-roster')).toHaveLength(4);
    expect(stored<string>('pb-active-roster')).toBe('g1');
    expect(stored<unknown>('pb-tutorial-state')).toBeNull();
  });

  it('never touches a real player who shares a sample name', () => {
    existingUser(['Sarah M.', 'Ben', 'Cara', 'Dan']);
    mount();
    startFromSplash();

    // Two Sarah M.s exist while the tour runs: hers, and the sample one.
    expect(
      stored<{ name: string }[]>('pb-roster').filter((p) => p.name === 'Sarah M.')
    ).toHaveLength(2);

    clickButton(/^Stop tutorial$/);
    const survivors = stored<{ id: string; name: string; rosterIds: string[] }[]>('pb-roster');
    const sarahs = survivors.filter((p) => p.name === 'Sarah M.');
    expect(sarahs).toHaveLength(1);
    expect(sarahs[0].id).toBe('p1');
    expect(sarahs[0].rosterIds).toEqual(['g1']);
  });

  it('a reload mid-rerun sweeps the temporary group before first paint', () => {
    existingUser();
    mount();
    startFromSplash();
    atStep(1);
    expect(stored<{ name: string }[]>('pb-roster')).toHaveLength(28);

    // The reload: module state gone, storage still holding the run record.
    remount();

    expect(stored<{ name: string }[]>('pb-rosters').map((r) => r.name)).toEqual(['Test Group']);
    expect(stored<{ name: string }[]>('pb-roster')).toHaveLength(4);
    expect(stored<string>('pb-active-roster')).toBe('g1');
    expect(stored<unknown>('pb-tutorial-state')).toBeNull();
    overlayGone();
    // And the sweep counts as a recent splash, so nothing pounces.
    expect(container.textContent).not.toContain('Skip Tutorial');
  });
});
