/**
 * @vitest-environment happy-dom
 *
 * The first-run tour, driven end to end on the real App.
 *
 * happy-dom has no layout, so every rect is zero and nothing here can say a
 * word about where the tour draws — that is all in tourGeometry.test.ts, which
 * checks it as arithmetic. What this file is for is the other half: which card
 * is showing, what it says, what moves the app, and above all who never sees any
 * of it. A tour that appears in front of a host mid-season with real groups is
 * the worst thing this feature could do, and the guard against it is one
 * `&&` — so it gets a test of its own.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { runMigrations } from './lib/migrations';
import { TOUR_STEPS, __tourTesting } from './lib/tour';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** A device nobody has ever opened the app on. */
function freshInstall() {
  window.localStorage.clear();
  runMigrations();
}

/** Somebody who already had the app before the tour existed. */
function existingInstall() {
  window.localStorage.clear();
  window.localStorage.setItem('pb-rosters', JSON.stringify([{ id: 'g1', name: 'Tuesday Crew' }]));
  window.localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
  window.localStorage.setItem(
    'pb-roster',
    JSON.stringify(
      ['Ava', 'Ben', 'Cara', 'Dan', 'Eve'].map((name, i) => ({
        id: `p${i}`,
        name,
        rating: 3.5,
        gender: i % 2 === 0 ? 'M' : 'F',
        rosterIds: ['g1'],
      }))
    )
  );
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

/** A relaunch: all the way down and up again. */
function remount(between?: () => void) {
  act(() => root.unmount());
  container.remove();
  between?.();
  mount();
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  __tourTesting.reset();
});

const text = (el: Element) => (el.textContent ?? '').trim();
const body = () => text(document.body);

function overlay(): HTMLElement | null {
  return document.querySelector('[data-tutorial-overlay]');
}

function splashShowing(): boolean {
  // Only the first half of the headline: it is broken over two lines with a
  // <br>, which contributes nothing to textContent, so the two run together.
  return body().includes('Let’s jump');
}

function click(el: Element) {
  act(() => {
    (el as HTMLElement).click();
  });
}

function button(re: RegExp, scope: ParentNode = document.body): HTMLElement {
  const found = [...scope.querySelectorAll('button, [role="button"]')].find((b) =>
    re.test(text(b))
  );
  if (!found) {
    throw new Error(
      `no button matching ${re}; saw: ${[...scope.querySelectorAll('button')]
        .map((b) => JSON.stringify(text(b).slice(0, 24)))
        .join(', ')}`
    );
  }
  return found as HTMLElement;
}

const clickButton = (re: RegExp, scope: ParentNode = document.body) => click(button(re, scope));

function has(re: RegExp, scope: ParentNode = document.body): boolean {
  return [...scope.querySelectorAll('button, [role="button"]')].some((b) => re.test(text(b)));
}

const stored = (key: string) => window.localStorage.getItem(key);
const stage = () => JSON.parse(stored('pb-tour-stage') ?? 'null');
/** Unwritten until something moves it, and the store's own default is roster. */
const step = () => JSON.parse(stored('pb-step') ?? '"roster"');

/** Off the splash and onto the first card. */
function begin() {
  mount();
  clickButton(/^Continue$/);
}

/** The whole of Act 1, ending with the app handed back. */
function throughAct1() {
  begin();
  clickButton(/^Next$/);
  clickButton(/^Next$/);
  clickButton(/^OK$/);
}

describe('who gets greeted', () => {
  it('greets a brand new install, and says what it put there', () => {
    freshInstall();
    mount();

    expect(splashShowing()).toBe(true);
    expect(body()).toContain('sample group with 14 players');
    expect(has(/^Continue$/)).toBe(true);
  });

  it('never greets somebody who already had the app', () => {
    // The whole guarantee, in one test. exampleMeta is written only by the
    // fresh-install branch of runMigrations, so an existing user has none —
    // and a stage flag on its own would greet every one of them on the next
    // launch after this ships.
    existingInstall();
    mount();

    expect(stored('pb-example-meta')).toBeNull();
    expect(splashShowing()).toBe(false);
    expect(overlay()).toBeNull();
    expect(body()).toContain('Tuesday Crew');
  });

  it('does not promise a guided tour at the bottom of the screen', () => {
    // The mockup offered one. It was dropped deliberately, and the offer must
    // not come back from the mockup without the thing behind it.
    freshInstall();
    mount();
    expect(body()).not.toContain('guided tour');
    expect(has(/tutorial/i)).toBe(false);
  });

  it('greets nobody twice', () => {
    freshInstall();
    begin();
    clickButton(/^Skip$/);
    remount();

    expect(splashShowing()).toBe(false);
    expect(overlay()).toBeNull();
  });
});

describe('act one', () => {
  it('opens on the Players card, pointing at the group and the way out', () => {
    freshInstall();
    begin();

    expect(splashShowing()).toBe(false);
    expect(overlay()).not.toBeNull();
    expect(stage()).toBe('act1');
    expect(body()).toContain('Here is your sample group!');
    expect(body()).toContain('Click here to setup your first round robin.');
    // No Back on the first card of an act: there is nowhere behind it.
    expect(has(/^Back$/)).toBe(false);
    expect(has(/^Skip$/)).toBe(true);
  });

  it('moves the tab when Next moves the card, and back again', () => {
    freshInstall();
    begin();
    expect(step()).toBe('roster');

    clickButton(/^Next$/);
    expect(step()).toBe('setup');
    expect(body()).toContain('Imagine you’ve booked 3 courts');
    expect(has(/^Back$/)).toBe(true);

    clickButton(/^Back$/);
    expect(step()).toBe('roster');
    expect(body()).toContain('Here is your sample group!');
  });

  it('lets the real Continue to Setup button move the card too', () => {
    // The one live control on the whole card. Tapping it must do its own job
    // and advance the tour, not fight an effect trying to drag the tab back.
    freshInstall();
    begin();
    clickButton(/^Continue to Setup/, container);

    expect(step()).toBe('setup');
    expect(body()).toContain('Imagine you’ve booked 3 courts');
  });

  it('asks for every player, and hands the app over on OK', () => {
    freshInstall();
    begin();
    clickButton(/^Next$/);
    clickButton(/^Next$/);
    expect(body()).toContain('Select all the players');
    expect(has(/^OK$/)).toBe(true);

    clickButton(/^OK$/);
    expect(overlay()).toBeNull();
    expect(stage()).toBe('await-schedule');
    expect(step()).toBe('setup');
  });

  it('says three courts, which is what a fresh install actually opens on', () => {
    // The copy is only true because the tour cannot run on a device that has
    // ever set this. Assert the coupling rather than trusting it.
    freshInstall();
    mount();
    expect(stored('pb-num-courts')).toBeNull();
    clickButton(/^Continue$/);
    clickButton(/^Next$/);
    expect(body()).toContain('3 courts');
    expect(body()).toContain('8 rounds');
  });
});

describe('the hand over', () => {
  it('really does let go: the host selects and generates for themselves', () => {
    freshInstall();
    throughAct1();

    clickButton(/^Select All$/, container);
    clickButton(/^Generate Schedule/, container);

    expect(step()).toBe('schedule');
    expect(body()).toContain('Congratulations on making your first round robin!');
    expect(stage()).toBe('act2');
  });

  it('waits as long as it takes, and stays out of the way meanwhile', () => {
    freshInstall();
    throughAct1();
    remount();

    expect(overlay()).toBeNull();
    expect(splashShowing()).toBe(false);
    expect(stage()).toBe('await-schedule');

    clickButton(/^Select All$/, container);
    clickButton(/^Generate Schedule/, container);
    expect(body()).toContain('Congratulations on making your first round robin!');
  });

  it('comes back to the card whose anchors are on screen, not where it counted to', () => {
    freshInstall();
    begin();
    clickButton(/^Next$/);
    expect(step()).toBe('setup');

    remount();
    expect(body()).toContain('Imagine you’ve booked 3 courts');
    expect(body()).not.toContain('Here is your sample group!');
  });
});

describe('act two', () => {
  function toAct2() {
    freshInstall();
    throughAct1();
    clickButton(/^Select All$/, container);
    clickButton(/^Generate Schedule/, container);
  }

  it('congratulates them, then names the three things on the page', () => {
    toAct2();
    expect(body()).toContain('Mark rounds as COMPLETED to collapse them.');
    // Nothing behind this card but a schedule that did not exist before it.
    expect(has(/^Back$/)).toBe(false);

    clickButton(/^Next$/);
    expect(body()).toContain('Change court numbers here.');
    expect(has(/^Back$/)).toBe(true);

    clickButton(/^Next$/);
    expect(body()).toContain('Select one player and then another to swap them.');
    // One seat drawn as tapped, so the words have something to describe. It is
    // a picture: the app's own prompt appears with it, and no swap is pending.
    expect(body()).toContain('Tap another player to swap');
    expect(container.querySelectorAll('.ring-blue-500').length).toBe(1);

    clickButton(/^Next$/);
    expect(body()).toContain('click Actions and then Start New Session');
  });

  it('ends on Done, and lets go for good', () => {
    toAct2();
    for (let i = 0; i < 4; i++) clickButton(/^Next$/);
    expect(body()).toContain('You’re all set!');

    clickButton(/^Done$/);
    expect(overlay()).toBeNull();
    expect(stage()).toBe('done');
    // The swap card taught this at more length than the hint ever did.
    expect(stored('pb-swap-hint-dismissed')).toBe('true');

    remount();
    expect(overlay()).toBeNull();
    expect(splashShowing()).toBe(false);
  });

  it('restarts its own act after a relaunch part way through', () => {
    toAct2();
    clickButton(/^Next$/);
    expect(body()).toContain('Change court numbers here.');

    remount();
    expect(body()).toContain('Mark rounds as COMPLETED to collapse them.');
  });
});

describe('the deck itself', () => {
  it('points at something that exists on every card', () => {
    // A dropped or renamed data-tutorial attribute leaves the tour pointing at
    // nothing, on a screen only brand new users ever see. This walks the deck
    // and checks each card's anchors against the page the card lives on.
    freshInstall();
    begin();

    const seen = new Set<string>();
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      const card = TOUR_STEPS[i];
      const wanted = [
        ...card.regions.flatMap((r) => [...r.anchors.map((a) => a.name), ...(r.endAt ? [r.endAt] : [])]),
        ...card.bubbles.flatMap((b) => (b.at ? [b.at] : [])),
      ];
      for (const name of wanted) {
        expect(
          document.querySelector(`[data-tutorial="${name}"]`),
          `card ${card.id} points at "${name}", which is not on the ${card.tab} tab`
        ).not.toBeNull();
        seen.add(name);
      }

      if (card.id === 'select-players') {
        // The hand-over card. Do what it asks, so the Schedule cards have a
        // schedule to point at.
        clickButton(/^OK$/);
        clickButton(/^Select All$/, container);
        clickButton(/^Generate Schedule/, container);
      } else if (i < TOUR_STEPS.length - 1) {
        clickButton(/^Next$/);
      }
    }

    // Every anchor in the app is used by the deck, and every anchor the deck
    // wants is in the app. A spare one is a rename half done.
    const inApp = new Set(
      [...document.querySelectorAll('[data-tutorial]')].map(
        (el) => el.getAttribute('data-tutorial')!
      )
    );
    for (const name of inApp) expect(seen, `nothing points at "${name}"`).toContain(name);
  });

  it('has a live control only where a real button is the lesson', () => {
    const live = TOUR_STEPS.filter((s) => s.live);
    expect(live.map((s) => s.id)).toEqual(['players']);
  });

  it('grows the Actions box enough to clear the icons hanging above it', () => {
    // The four tiles sit at -top-[17px], outside the button's border box, so a
    // ring drawn on the measurement alone cuts their heads off. Jeff asked for
    // this one specifically; it is the only anchor in the deck that needs it.
    const actions = TOUR_STEPS.find((s) => s.id === 'actions')!;
    const anchor = actions.regions[0].anchors[0];
    expect(anchor.name).toBe('actions-button');
    expect(anchor.pad?.top ?? 0).toBeGreaterThan(17);
  });

  it('never shows more than two bubbles at once', () => {
    for (const card of TOUR_STEPS) {
      expect(card.bubbles.length, `card ${card.id}`).toBeLessThanOrEqual(2);
    }
  });
});
